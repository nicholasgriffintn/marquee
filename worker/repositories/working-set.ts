const POPULAR_TITLES = 30_000;

export const DEMAND_MAX_AGE_DAYS = 7;
export const TAIL_MAX_AGE_DAYS = 30;

const DEMAND_SOURCES = [
  `SELECT id, ?1, 0 FROM catalog_titles ORDER BY popularity DESC LIMIT ${POPULAR_TITLES}`,
  `SELECT title_id, ?1, 1 FROM viewing_entries`,
  `SELECT entry.value, ?1, 1 FROM catalog_sections AS s, json_each(s.title_ids) AS entry`,
  `SELECT entry.value, ?1, 1 FROM pinned_shelves AS p, json_each(p.title_ids) AS entry`,
  `SELECT title_id, ?1, 1 FROM title_insights`,
  `SELECT title_id, ?1, 1 FROM title_schedule WHERE title_id IS NOT NULL`,
];

const MAX_AGE_EXPRESSION = `CASE WHEN w.demand = 1 THEN '-${DEMAND_MAX_AGE_DAYS} days' ELSE '-${TAIL_MAX_AGE_DAYS} days' END`;

export async function rebuildWorkingSet(db: D1Database) {
  const generation = new Date().toISOString();

  await db.batch(
    DEMAND_SOURCES.map((source) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO title_working_set (title_id, refreshed_at, demand) ${source}`,
        )
        .bind(generation),
    ),
  );

  const pruned = await db
    .prepare(`DELETE FROM title_working_set WHERE refreshed_at < ?`)
    .bind(generation)
    .run();
  const kept = await db
    .prepare(`SELECT count(*) AS titles, sum(demand) AS demanded FROM title_working_set`)
    .first<{ titles: number; demanded: number }>();

  console.log(
    JSON.stringify({
      event: "working_set_rebuilt",
      titles: kept?.titles ?? 0,
      demanded: kept?.demanded ?? 0,
      pruned: pruned.meta.changes,
    }),
  );

  return kept?.titles ?? 0;
}

export async function readWorkingSetStats(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT count(*) AS titles,
              sum(
                CASE
                  WHEN t.enriched_at IS NOT NULL
                    AND t.enriched_at > datetime('now', ${MAX_AGE_EXPRESSION}) THEN 1
                  ELSE 0
                END
              ) AS fresh
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id`,
    )
    .first<{ titles: number; fresh: number }>();

  return { titles: row?.titles ?? 0, fresh: row?.fresh ?? 0 };
}

export async function countStaleWorkingSet(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT count(*) AS stale
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       WHERE t.enriched_at IS NULL
          OR t.enriched_at < datetime('now', ${MAX_AGE_EXPRESSION})`,
    )
    .first<{ stale: number }>();

  return row?.stale ?? 0;
}

export async function selectStaleWorkingSet(db: D1Database, limit: number) {
  const rows = await db
    .prepare(
      `SELECT t.id AS titleId
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN (SELECT DISTINCT title_id FROM viewing_entries) AS saved
         ON saved.title_id = t.id
       WHERE t.enriched_at IS NULL
          OR t.enriched_at < datetime('now', ${MAX_AGE_EXPRESSION})
       ORDER BY (saved.title_id IS NOT NULL) DESC, w.demand DESC, t.popularity DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}
