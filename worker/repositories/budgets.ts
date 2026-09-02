import { UPSTREAM_SOURCES, type UpstreamSourceId } from "../../src/domain/sources.ts";
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

export type BudgetSource = UpstreamSourceId;

const BUDGET_ALIAS: Partial<Record<BudgetableSource, BudgetSource>> = {
  poster: "omdb",
};

export type BudgetableSource = EnrichmentSource | UpstreamSourceId;

export const SOURCE_BUDGETS = Object.fromEntries(
  Object.values(UPSTREAM_SOURCES).map((configured) => [
    configured.id,
    { windowKind: configured.window, callLimit: configured.callLimit },
  ]),
) as Record<BudgetSource, { windowKind: "day" | "month"; callLimit: number }>;

export function budgetSource(source: BudgetableSource): BudgetSource {
  return BUDGET_ALIAS[source] ?? (source as BudgetSource);
}

function windowExpression(windowKind: "day" | "month") {
  return windowKind === "day" ? "-1 day" : "-1 month";
}

function seedBudget(transaction: DatabaseTransaction, source: BudgetSource) {
  const configured = SOURCE_BUDGETS[source];

  return transaction.execute(
    `INSERT INTO source_budgets (source, window_kind, call_limit)
     VALUES ($1, $2, $3)
     ON CONFLICT(source) DO NOTHING`,
    [source, configured.windowKind, configured.callLimit],
  );
}

export async function ensureBudgets(env: Bindings) {
  const sources = Object.keys(SOURCE_BUDGETS) as BudgetSource[];
  const reconciled = await env.DB.transaction(async (transaction) => {
    let changes = 0;

    for (const source of sources) {
      const configured = SOURCE_BUDGETS[source];

      // oxlint-disable-next-line no-await-in-loop
      const result = await transaction.execute(
        `INSERT INTO source_budgets (source, window_kind, call_limit)
         VALUES ($1, $2, $3)
         ON CONFLICT(source) DO UPDATE SET
           window_kind = excluded.window_kind,
           call_limit = excluded.call_limit,
           updated_at = CURRENT_TIMESTAMP
         WHERE source_budgets.window_kind <> excluded.window_kind
            OR source_budgets.call_limit <> excluded.call_limit`,
        [source, configured.windowKind, configured.callLimit],
      );

      changes += result.rowCount;
    }

    return changes;
  });
  const dropped = await env.DB.execute(
    `DELETE FROM source_budgets
     WHERE source NOT IN (${sources.map((_, index) => `$${index + 1}`).join(",")})`,
    [...sources],
  );

  logEvent("budgets_reconciled", {
    sources: sources.length,
    reconciled,
    dropped: dropped.rowCount,
  });

  return reconciled;
}

export async function readBudgetRoom(env: Bindings, source: BudgetableSource) {
  const resolved = budgetSource(source);
  const configured = SOURCE_BUDGETS[resolved];
  const row = await env.DB.first<{ room: number }>(
    `SELECT CASE
              WHEN paused_until IS NOT NULL AND paused_until > CURRENT_TIMESTAMP THEN 0
              WHEN window_started_at <= (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)) THEN call_limit
              ELSE GREATEST(0, call_limit - used)
            END AS room
     FROM source_budgets
     WHERE source = $2`,
    [windowExpression(configured.windowKind), resolved],
  );

  return row ? row.room : configured.callLimit;
}

const SWEEP_HOURS = 3;

export async function readBudgetPace(env: Bindings, source: BudgetableSource) {
  const resolved = budgetSource(source);
  const configured = SOURCE_BUDGETS[resolved];
  const expression = windowExpression(configured.windowKind);
  const windowHours = configured.windowKind === "day" ? 24 : 24 * 30;
  const row = await env.DB.first<{ room: number; hoursLeft: number }>(
    `SELECT CASE
              WHEN paused_until IS NOT NULL AND paused_until > CURRENT_TIMESTAMP THEN 0
              WHEN window_started_at <= (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)) THEN call_limit
              ELSE GREATEST(0, call_limit - used)
            END AS room,
            CASE
              WHEN window_started_at <= (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL)) THEN $3
              ELSE EXTRACT(EPOCH FROM ((window_started_at + CAST($4 AS INTERVAL)) - CURRENT_TIMESTAMP)) / 3600.0
            END AS "hoursLeft"
     FROM source_budgets
     WHERE source = $5`,
    [
      expression,
      expression,
      windowHours,
      configured.windowKind === "day" ? "+1 day" : "+1 month",
      resolved,
    ],
  );

  if (!row) {
    return Math.floor(configured.callLimit / Math.ceil(windowHours / SWEEP_HOURS));
  }

  const sweeps = Math.max(1, Math.ceil(row.hoursLeft / SWEEP_HOURS));

  return Math.floor(row.room / sweeps);
}

export async function claimBudget(env: Bindings, source: BudgetableSource, reserve = 0) {
  const resolved = budgetSource(source);
  const expression = windowExpression(SOURCE_BUDGETS[resolved].windowKind);
  const protectedCalls = Math.max(0, Math.trunc(reserve));
  const claim = () =>
    env.DB.execute(
      `UPDATE source_budgets
       SET used = CASE WHEN window_started_at <= (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)) THEN 1 ELSE used + 1 END,
           window_started_at = CASE
             WHEN window_started_at <= (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL)) THEN CURRENT_TIMESTAMP
             ELSE window_started_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE source = $3
         AND (paused_until IS NULL OR paused_until <= CURRENT_TIMESTAMP)
         AND (
           (window_started_at <= (CURRENT_TIMESTAMP + CAST($4 AS INTERVAL)) AND call_limit > $5)
           OR (window_started_at > (CURRENT_TIMESTAMP + CAST($6 AS INTERVAL)) AND used < GREATEST(0, call_limit - $7))
         )`,
      [expression, expression, resolved, expression, protectedCalls, expression, protectedCalls],
    );
  const claimed = await claim();

  if (claimed.rowCount > 0) {
    return true;
  }

  const seeded = await seedBudget(env.DB, resolved);

  if (seeded.rowCount === 0) {
    return false;
  }

  return (await claim()).rowCount > 0;
}

export async function pauseSource(env: Bindings, source: BudgetableSource, policy: BackoffPolicy) {
  const resolved = budgetSource(source);
  const current = await env.DB.first<{ consecutivePauses: number }>(
    `SELECT consecutive_pauses AS "consecutivePauses" FROM source_budgets WHERE source = $1`,
    [resolved],
  );
  const consecutive = current?.consecutivePauses ?? 0;
  const minutes = escalate(policy, consecutive);

  await env.DB.execute(
    `UPDATE source_budgets
     SET paused_until = (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)),
         consecutive_pauses = consecutive_pauses + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE source = $2`,
    [`+${Math.max(1, Math.trunc(minutes))} minutes`, resolved],
  );

  logEvent("source_paused", { source, minutes, consecutive: consecutive + 1 });
}

export async function resetBackoff(env: Bindings, source: BudgetableSource) {
  await env.DB.execute(
    `UPDATE source_budgets SET consecutive_pauses = 0 WHERE source = $1 AND consecutive_pauses <> 0`,
    [budgetSource(source)],
  );
}

export async function resumeSource(env: Bindings, source: BudgetableSource) {
  await env.DB.execute(
    `UPDATE source_budgets
     SET paused_until = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE source = $1`,
    [budgetSource(source)],
  );
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
  const rows = await env.DB.query<BudgetRow & { source: string }>(
    `SELECT source, window_kind AS "windowKind", call_limit AS "callLimit", used,
            window_started_at AS "windowStartedAt", paused_until AS "pausedUntil",
            consecutive_pauses AS "consecutivePauses"
     FROM source_budgets
     WHERE source IN (${configured.map((_, index) => `$${index + 1}`).join(",")})
     ORDER BY source`,
    [...configured],
  );
  const seen = new Set(rows.rows.map((row) => row.source));
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

  return [...rows.rows, ...missing].toSorted((left, right) =>
    left.source.localeCompare(right.source),
  );
}
