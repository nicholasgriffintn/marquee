import type { IdentifierRef } from "../clients/wikidata-identifiers.ts";
import { insertRows } from "./catalog-array-utils.ts";

const REFRESH_DAYS = 90;
const RETRY_DAYS = 14;

export async function selectIdentifierCandidates(db: D1Database, limit: number) {
  const rows = await db
    .prepare(
      `SELECT t.id AS titleId, t.media_type AS mediaType, t.tmdb_id AS tmdbId,
              t.wikidata_id AS wikidataId
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_identifier_syncs AS s ON s.title_id = t.id
       WHERE s.title_id IS NULL
          OR s.synced_at < datetime('now', CASE WHEN s.matched = 1 THEN ? ELSE ? END)
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT ?`,
    )
    .bind(`-${REFRESH_DAYS} days`, `-${RETRY_DAYS} days`, limit)
    .all<IdentifierRef>();

  return rows.results;
}

export async function recordIdentifierSyncs(
  db: D1Database,
  entries: { titleId: string; matched: boolean }[],
) {
  await insertRows(
    db,
    2,
    30,
    entries.map((entry): unknown[] => [entry.titleId, entry.matched ? 1 : 0]),
    (chunk) =>
      `INSERT INTO title_identifier_syncs (title_id, matched)
       VALUES ${chunk.map(() => "(?, ?)").join(", ")}
       ON CONFLICT (title_id) DO UPDATE SET
         matched = excluded.matched,
         synced_at = CURRENT_TIMESTAMP`,
  );
}
