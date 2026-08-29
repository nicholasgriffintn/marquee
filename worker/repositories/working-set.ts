import { logEvent } from "../lib/logging.ts";

const POPULAR_TITLES = 30_000;

export const DEMAND_MAX_AGE_DAYS = 7;
export const TAIL_MAX_AGE_DAYS = 30;

const DEMAND_SOURCES = [
  `SELECT id AS title_id, 0 AS demand
   FROM (SELECT id FROM catalog_titles ORDER BY popularity DESC LIMIT ${POPULAR_TITLES}) AS popular`,
  `SELECT title_id, 1 AS demand FROM viewing_entries`,
  `SELECT entry.value AS title_id, 1 AS demand FROM catalog_sections AS s
   CROSS JOIN LATERAL jsonb_array_elements_text(s.title_ids::jsonb) AS entry(value)`,
  `SELECT entry.value AS title_id, 1 AS demand FROM pinned_shelves AS p
   CROSS JOIN LATERAL jsonb_array_elements_text(p.title_ids::jsonb) AS entry(value)`,
  `SELECT title_id, 1 AS demand FROM title_insights`,
  `SELECT title_id, 1 AS demand FROM title_schedule WHERE title_id IS NOT NULL`,
];

const MAX_AGE_EXPRESSION = `CAST(CASE WHEN w.demand = 1 THEN '-${DEMAND_MAX_AGE_DAYS} days' ELSE '-${TAIL_MAX_AGE_DAYS} days' END AS INTERVAL)`;

export async function rebuildWorkingSet(db: Database) {
  const generation = new Date().toISOString();

  await db.execute(
    `INSERT INTO title_working_set (title_id, refreshed_at, demand)
     SELECT title_id, $1, max(demand)
     FROM (${DEMAND_SOURCES.join(" UNION ALL ")}) AS demand_sources
     GROUP BY title_id
     ON CONFLICT(title_id) DO UPDATE SET
       refreshed_at = excluded.refreshed_at,
       demand = excluded.demand`,
    [generation],
  );

  const pruned = await db.execute(`DELETE FROM title_working_set WHERE refreshed_at < $1`, [
    generation,
  ]);
  const kept = await db.first<{ titles: number; demanded: number }>(
    `SELECT count(*) AS titles, sum(demand) AS demanded FROM title_working_set`,
  );

  logEvent("working_set_rebuilt", {
    titles: kept?.titles ?? 0,
    demanded: kept?.demanded ?? 0,
    pruned: pruned.rowCount,
  });

  return kept?.titles ?? 0;
}

export async function readWorkingSetStats(db: Database) {
  const row = await db.first<{ titles: number; fresh: number }>(`SELECT count(*) AS titles,
              sum(
                CASE
                  WHEN t.enriched_at IS NOT NULL
                    AND t.enriched_at > CURRENT_TIMESTAMP + ${MAX_AGE_EXPRESSION} THEN 1
                  ELSE 0
                END
              ) AS fresh
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id`);

  return { titles: row?.titles ?? 0, fresh: row?.fresh ?? 0 };
}

export async function countStaleWorkingSet(db: Database) {
  const row = await db.first<{ stale: number }>(`SELECT count(*) AS stale
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       WHERE t.enriched_at IS NULL
          OR t.enriched_at < CURRENT_TIMESTAMP + ${MAX_AGE_EXPRESSION}`);

  return row?.stale ?? 0;
}

export async function selectStaleWorkingSet(db: Database, limit: number) {
  const rows = await db.query<{ titleId: string }>(
    `SELECT t.id AS "titleId"
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN (SELECT DISTINCT title_id FROM viewing_entries) AS saved
         ON saved.title_id = t.id
       WHERE t.enriched_at IS NULL
          OR t.enriched_at < CURRENT_TIMESTAMP + ${MAX_AGE_EXPRESSION}
       ORDER BY (saved.title_id IS NOT NULL) DESC, w.demand DESC, t.popularity DESC
       LIMIT $1`,
    [limit],
  );

  return rows.rows.map((row) => row.titleId);
}
