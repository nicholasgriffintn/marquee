import type { Bindings, EnrichmentSource } from "../types.ts";

type BudgetRow = {
  windowKind: "day" | "month";
  callLimit: number;
  used: number;
  windowStartedAt: string;
};

export const SOURCE_BUDGETS: Record<
  EnrichmentSource,
  { windowKind: "day" | "month"; callLimit: number }
> = {
  watchmode: { windowKind: "month", callLimit: 1_000 },
  omdb: { windowKind: "day", callLimit: 500_000 },
  poster: { windowKind: "day", callLimit: 500_000 },
  trakt: { windowKind: "day", callLimit: 100_000 },
  simkl: { windowKind: "day", callLimit: 50_000 },
};

function windowExpression(windowKind: "day" | "month") {
  return windowKind === "day" ? "-1 day" : "-1 month";
}

export async function claimBudget(env: Bindings, source: EnrichmentSource) {
  const configured = SOURCE_BUDGETS[source];

  await env.DB.prepare(
    `INSERT INTO source_budgets (source, window_kind, call_limit)
     VALUES (?, ?, ?)
     ON CONFLICT(source) DO NOTHING`,
  )
    .bind(source, configured.windowKind, configured.callLimit)
    .run();

  const row = await env.DB.prepare(
    `SELECT window_kind AS windowKind, call_limit AS callLimit, used, window_started_at AS windowStartedAt
     FROM source_budgets
     WHERE source = ?`,
  )
    .bind(source)
    .first<BudgetRow>();

  if (!row) {
    return false;
  }

  const reset = await env.DB.prepare(
    `UPDATE source_budgets
     SET used = 0, window_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE source = ? AND window_started_at <= datetime('now', ?)`,
  )
    .bind(source, windowExpression(row.windowKind))
    .run();
  const used = reset.meta.changes > 0 ? 0 : row.used;

  if (used >= row.callLimit) {
    return false;
  }

  const claimed = await env.DB.prepare(
    `UPDATE source_budgets
     SET used = used + 1, updated_at = CURRENT_TIMESTAMP
     WHERE source = ? AND used < call_limit`,
  )
    .bind(source)
    .run();

  return claimed.meta.changes > 0;
}

export async function readBudgets(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT source, window_kind AS windowKind, call_limit AS callLimit, used,
            window_started_at AS windowStartedAt
     FROM source_budgets
     ORDER BY source`,
  ).all<BudgetRow & { source: string }>();

  return rows.results;
}
