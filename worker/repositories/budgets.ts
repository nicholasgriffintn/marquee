import { escalate, type BackoffPolicy } from "../lib/backoff.ts";
import { logEvent } from "../lib/logging.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

type BudgetRow = {
  windowKind: "day" | "month";
  callLimit: number;
  used: number;
  windowStartedAt: string;
  pausedUntil: string | null;
  consecutivePauses: number;
};

export type BudgetSource = Exclude<EnrichmentSource, "poster">;

const BUDGET_ALIAS: Partial<Record<EnrichmentSource, BudgetSource>> = { poster: "omdb" };

export const SOURCE_BUDGETS: Record<
  BudgetSource,
  { windowKind: "day" | "month"; callLimit: number }
> = {
  tmdb: { windowKind: "day", callLimit: 12_000 },
  justwatch: { windowKind: "day", callLimit: 20_000 },
  omdb: { windowKind: "day", callLimit: 500_000 },
  jikan: { windowKind: "day", callLimit: 20_000 },
};

export function budgetSource(source: EnrichmentSource): BudgetSource {
  return BUDGET_ALIAS[source] ?? (source as BudgetSource);
}

function windowExpression(windowKind: "day" | "month") {
  return windowKind === "day" ? "-1 day" : "-1 month";
}

function seedBudget(env: Bindings, source: BudgetSource) {
  const configured = SOURCE_BUDGETS[source];

  return env.DB.prepare(
    `INSERT INTO source_budgets (source, window_kind, call_limit)
     VALUES (?, ?, ?)
     ON CONFLICT(source) DO NOTHING`,
  ).bind(source, configured.windowKind, configured.callLimit);
}

export async function ensureBudgets(env: Bindings) {
  const sources = Object.keys(SOURCE_BUDGETS) as BudgetSource[];
  const results = await env.DB.batch(
    sources.map((source) => {
      const configured = SOURCE_BUDGETS[source];

      return env.DB.prepare(
        `INSERT INTO source_budgets (source, window_kind, call_limit)
         VALUES (?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
           window_kind = excluded.window_kind,
           call_limit = excluded.call_limit,
           updated_at = CURRENT_TIMESTAMP
         WHERE source_budgets.window_kind <> excluded.window_kind
            OR source_budgets.call_limit <> excluded.call_limit`,
      ).bind(source, configured.windowKind, configured.callLimit);
    }),
  );
  const reconciled = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  const dropped = await env.DB.prepare(
    `DELETE FROM source_budgets
     WHERE source NOT IN (${sources.map(() => "?").join(",")})`,
  )
    .bind(...sources)
    .run();

  logEvent("budgets_reconciled", {
    sources: sources.length,
    reconciled,
    dropped: dropped.meta.changes,
  });

  return reconciled;
}

export async function readBudgetRoom(env: Bindings, source: EnrichmentSource) {
  const resolved = budgetSource(source);
  const configured = SOURCE_BUDGETS[resolved];
  const row = await env.DB.prepare(
    `SELECT CASE
              WHEN paused_until IS NOT NULL AND paused_until > CURRENT_TIMESTAMP THEN 0
              WHEN window_started_at <= datetime('now', ?) THEN call_limit
              ELSE max(0, call_limit - used)
            END AS room
     FROM source_budgets
     WHERE source = ?`,
  )
    .bind(windowExpression(configured.windowKind), resolved)
    .first<{ room: number }>();

  return row ? row.room : configured.callLimit;
}

const SWEEP_HOURS = 3;

export async function readBudgetPace(env: Bindings, source: EnrichmentSource) {
  const resolved = budgetSource(source);
  const configured = SOURCE_BUDGETS[resolved];
  const expression = windowExpression(configured.windowKind);
  const windowHours = configured.windowKind === "day" ? 24 : 24 * 30;
  const row = await env.DB.prepare(
    `SELECT CASE
              WHEN paused_until IS NOT NULL AND paused_until > CURRENT_TIMESTAMP THEN 0
              WHEN window_started_at <= datetime('now', ?) THEN call_limit
              ELSE max(0, call_limit - used)
            END AS room,
            CASE
              WHEN window_started_at <= datetime('now', ?) THEN ?
              ELSE (julianday(window_started_at, ?) - julianday('now')) * 24
            END AS hoursLeft
     FROM source_budgets
     WHERE source = ?`,
  )
    .bind(
      expression,
      expression,
      windowHours,
      configured.windowKind === "day" ? "+1 day" : "+1 month",
      resolved,
    )
    .first<{ room: number; hoursLeft: number }>();

  if (!row) {
    return Math.floor(configured.callLimit / Math.ceil(windowHours / SWEEP_HOURS));
  }

  const sweeps = Math.max(1, Math.ceil(row.hoursLeft / SWEEP_HOURS));

  return Math.floor(row.room / sweeps);
}

export async function claimBudget(env: Bindings, source: EnrichmentSource) {
  const resolved = budgetSource(source);
  const expression = windowExpression(SOURCE_BUDGETS[resolved].windowKind);
  const claim = () =>
    env.DB.prepare(
      `UPDATE source_budgets
       SET used = CASE WHEN window_started_at <= datetime('now', ?) THEN 1 ELSE used + 1 END,
           window_started_at = CASE
             WHEN window_started_at <= datetime('now', ?) THEN CURRENT_TIMESTAMP
             ELSE window_started_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE source = ?
         AND (paused_until IS NULL OR paused_until <= CURRENT_TIMESTAMP)
         AND (window_started_at <= datetime('now', ?) OR used < call_limit)`,
    )
      .bind(expression, expression, resolved, expression)
      .run();
  const claimed = await claim();

  if (claimed.meta.changes > 0) {
    return true;
  }

  const seeded = await seedBudget(env, resolved).run();

  if (seeded.meta.changes === 0) {
    return false;
  }

  return (await claim()).meta.changes > 0;
}

export async function pauseSource(env: Bindings, source: EnrichmentSource, policy: BackoffPolicy) {
  const resolved = budgetSource(source);
  const current = await env.DB.prepare(
    `SELECT consecutive_pauses AS consecutivePauses FROM source_budgets WHERE source = ?`,
  )
    .bind(resolved)
    .first<{ consecutivePauses: number }>();
  const consecutive = current?.consecutivePauses ?? 0;
  const minutes = escalate(policy, consecutive);

  await env.DB.prepare(
    `UPDATE source_budgets
     SET paused_until = datetime('now', ?),
         consecutive_pauses = consecutive_pauses + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE source = ?`,
  )
    .bind(`+${Math.max(1, Math.trunc(minutes))} minutes`, resolved)
    .run();

  logEvent("source_paused", { source, minutes, consecutive: consecutive + 1 });
}

export async function resetBackoff(env: Bindings, source: EnrichmentSource) {
  await env.DB.prepare(
    `UPDATE source_budgets SET consecutive_pauses = 0 WHERE source = ? AND consecutive_pauses <> 0`,
  )
    .bind(budgetSource(source))
    .run();
}

export async function resumeSource(env: Bindings, source: EnrichmentSource) {
  await env.DB.prepare(
    `UPDATE source_budgets
     SET paused_until = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE source = ?`,
  )
    .bind(budgetSource(source))
    .run();
}

function statusOf(error: unknown) {
  return error instanceof Error && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
}

export function isRateLimited(error: unknown) {
  return statusOf(error) === 429;
}

export function isUpstreamDown(error: unknown) {
  const status = statusOf(error);

  return status === 502 || status === 503 || status === 504;
}

export function isRefused(error: unknown) {
  return statusOf(error) === 403 || statusOf(error) === 401;
}

export async function readBudgets(env: Bindings) {
  const configured = Object.keys(SOURCE_BUDGETS);
  const rows = await env.DB.prepare(
    `SELECT source, window_kind AS windowKind, call_limit AS callLimit, used,
            window_started_at AS windowStartedAt, paused_until AS pausedUntil,
            consecutive_pauses AS consecutivePauses
     FROM source_budgets
     WHERE source IN (${configured.map(() => "?").join(",")})
     ORDER BY source`,
  )
    .bind(...configured)
    .all<BudgetRow & { source: string }>();
  const seen = new Set(rows.results.map((row) => row.source));
  const missing = configured
    .filter((source) => !seen.has(source))
    .map((source) => ({
      source,
      windowKind: SOURCE_BUDGETS[source as BudgetSource].windowKind,
      callLimit: SOURCE_BUDGETS[source as BudgetSource].callLimit,
      used: 0,
      windowStartedAt: "",
      pausedUntil: null,
      consecutivePauses: 0,
    }));

  return [...rows.results, ...missing].sort((left, right) =>
    left.source.localeCompare(right.source),
  );
}
