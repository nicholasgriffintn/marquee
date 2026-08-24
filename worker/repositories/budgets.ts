import { logEvent } from "../lib/logging.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

type BudgetRow = {
  windowKind: "day" | "month";
  callLimit: number;
  used: number;
  windowStartedAt: string;
  pausedUntil: string | null;
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
  simkl: { windowKind: "day", callLimit: 5_000 },
  anilist: { windowKind: "day", callLimit: 2_000 },
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

export async function pauseSource(env: Bindings, source: EnrichmentSource, minutes: number) {
  await env.DB.prepare(
    `UPDATE source_budgets
     SET paused_until = datetime('now', ?), updated_at = CURRENT_TIMESTAMP
     WHERE source = ?`,
  )
    .bind(`+${Math.max(1, Math.trunc(minutes))} minutes`, budgetSource(source))
    .run();

  logEvent("source_paused", { source, minutes });
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

export function isRateLimited(error: unknown) {
  return (
    error instanceof Error && "status" in error && (error as { status?: unknown }).status === 429
  );
}

export async function readBudgets(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT source, window_kind AS windowKind, call_limit AS callLimit, used,
            window_started_at AS windowStartedAt, paused_until AS pausedUntil
     FROM source_budgets
     ORDER BY source`,
  ).all<BudgetRow & { source: string }>();

  return rows.results;
}
