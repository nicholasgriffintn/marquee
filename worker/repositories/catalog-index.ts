import { clamp } from "../lib/numbers.ts";
import { isKnownTitle } from "../lib/validation.ts";

export type IndexReason = "title" | "extensions" | "rebuild";

export type SearchIndexState = {
  titles: number;
  indexed: number;
  pending: number;
  oldestPendingAt: string | null;
};

const PROJECT_CHUNK = 100;

const TAGS = `trim(
  COALESCE((SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = t.id), '')
  || ' ' ||
  COALESCE((SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = t.id), '')
)`;

const PEOPLE = `COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = t.id), '')`;

function chunk(ids: string[]) {
  const waves: string[][] = [];

  for (let index = 0; index < ids.length; index += PROJECT_CHUNK) {
    waves.push(ids.slice(index, index + PROJECT_CHUNK));
  }

  return waves;
}

function knownTitleIds(titleIds: string[]) {
  return [...new Set(titleIds.filter(isKnownTitle))];
}

export function markTitlesForIndexing(db: D1Database, titleIds: string[], reason: IndexReason) {
  const unique = knownTitleIds(titleIds);

  if (unique.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    chunk(unique).map((wave) =>
      db
        .prepare(
          `INSERT INTO catalog_index_pending (title_id, reason)
           SELECT value, ?2 FROM json_each(?1)
           WHERE true
           ON CONFLICT(title_id) DO NOTHING`,
        )
        .bind(JSON.stringify(wave), reason)
        .run(),
    ),
  ).then(() => undefined);
}

// The projection is rebuilt rather than patched: extension rows are written by their own
// repositories, so the only reliable snapshot is the one taken at reconciliation time.
export async function projectTitles(db: D1Database, titleIds: string[]) {
  const unique = knownTitleIds(titleIds);

  for (const wave of chunk(unique)) {
    const ids = JSON.stringify(wave);

    // oxlint-disable-next-line no-await-in-loop
    await db.batch([
      db
        .prepare(
          `DELETE FROM catalog_search
           WHERE rowid IN (
             SELECT rowid FROM catalog_titles WHERE id IN (SELECT value FROM json_each(?1))
           )`,
        )
        .bind(ids),
      db
        .prepare(
          `INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
           SELECT t.rowid, t.title, t.original_title, t.overview, ${TAGS}, ${PEOPLE}, t.id
           FROM catalog_titles AS t
           WHERE t.id IN (SELECT value FROM json_each(?1))`,
        )
        .bind(ids),
      db
        .prepare(
          `DELETE FROM catalog_index_pending WHERE title_id IN (SELECT value FROM json_each(?1))`,
        )
        .bind(ids),
    ]);
  }

  return unique.length;
}

export async function takePendingTitles(db: D1Database, limit: number) {
  const rows = await db
    .prepare(
      `SELECT title_id AS titleId
       FROM catalog_index_pending
       ORDER BY queued_at
       LIMIT ?`,
    )
    .bind(clamp(Math.trunc(limit), 1, 20_000))
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}

export async function queueSearchRebuild(db: D1Database) {
  await db
    .prepare(
      `INSERT INTO catalog_index_pending (title_id, reason)
       SELECT id, 'rebuild' FROM catalog_titles
       WHERE true
       ON CONFLICT(title_id) DO NOTHING`,
    )
    .run();

  const row = await db
    .prepare(`SELECT count(*) AS pending FROM catalog_index_pending`)
    .first<{ pending: number }>();

  return row?.pending ?? 0;
}

export async function readSearchIndexState(db: D1Database): Promise<SearchIndexState> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM catalog_titles) AS titles,
         (SELECT count(*) FROM catalog_search) AS indexed,
         (SELECT count(*) FROM catalog_index_pending) AS pending,
         (SELECT min(queued_at) FROM catalog_index_pending) AS oldestPendingAt`,
    )
    .first<SearchIndexState>();

  return {
    titles: row?.titles ?? 0,
    indexed: row?.indexed ?? 0,
    pending: row?.pending ?? 0,
    oldestPendingAt: row?.oldestPendingAt ?? null,
  };
}
