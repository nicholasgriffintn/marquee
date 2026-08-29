import { logEvent } from "../lib/logging.ts";

const TAGS = `COALESCE((SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = t.id), '') || ' ' ||
       COALESCE((SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = t.id), '')`;

const PEOPLE = `COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = t.id), '')`;

const DRIFTED = `SELECT t.rowid
     FROM catalog_titles AS t
     JOIN catalog_search AS s ON s.rowid = t.rowid
    WHERE s.title_id <> t.id
       OR s.title <> t.title
       OR s.original_title <> t.original_title
       OR s.overview <> t.overview
       OR s.tags <> (${TAGS})
       OR s.people <> (${PEOPLE})`;

const UNPROJECTED = `SELECT t.rowid
     FROM catalog_titles AS t
    WHERE NOT EXISTS (SELECT 1 FROM catalog_search AS s WHERE s.rowid = t.rowid)`;

const RECONCILE_LIMIT = 5_000;

export async function countSearchDrift(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT (SELECT count(*) FROM (${DRIFTED})) + (SELECT count(*) FROM (${UNPROJECTED}))
              AS drifted`,
    )
    .first<{ drifted: number }>();

  return row?.drifted ?? 0;
}

export async function reconcileSearchIndex(db: D1Database, limit = RECONCILE_LIMIT) {
  await db
    .prepare(`DELETE FROM catalog_search WHERE rowid IN (${DRIFTED} LIMIT ?)`)
    .bind(limit)
    .run();

  const rebuilt = await db
    .prepare(
      `INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
       SELECT t.rowid, t.title, t.original_title, t.overview, ${TAGS}, ${PEOPLE}, t.id
       FROM catalog_titles AS t
       WHERE NOT EXISTS (SELECT 1 FROM catalog_search AS s WHERE s.rowid = t.rowid)`,
    )
    .run();
  const repaired = rebuilt.meta.changes ?? 0;
  const remaining = await countSearchDrift(db);

  logEvent("search_index_reconciled", { repaired, remaining });

  return { repaired, remaining };
}
