import { clamp } from "../lib/numbers.ts";
import { estimatedRows } from "../lib/sql.ts";
import { isKnownTitle } from "../lib/validation.ts";

export type IndexReason = "title" | "extensions" | "rebuild";

export type SearchIndexState = {
  titles: number;
  indexed: number;
  pending: number;
  oldestPendingAt: string | null;
};

export type SearchIndexDrift = {
  sampled: number;
  stale: number;
};

const PROJECT_CHUNK = 100;
const DRIFT_SAMPLE = 1_500;
const DRIFT_SAMPLE_PERCENT = 0.4;

const DRIFT_TAGS = `trim(
  COALESCE((SELECT string_agg(genre, ' ' ORDER BY position) FROM catalog_title_genres WHERE title_id = sample.title_id), '')
  || ' ' ||
  COALESCE((SELECT string_agg(keyword, ' ' ORDER BY position) FROM catalog_title_keywords WHERE title_id = sample.title_id), '')
)`;

const DRIFT_PEOPLE = `COALESCE((SELECT string_agg(person, ' ' ORDER BY position) FROM catalog_title_people WHERE title_id = sample.title_id), '')`;

const TAGS = `trim(
  COALESCE((SELECT string_agg(genre, ' ' ORDER BY position) FROM catalog_title_genres WHERE title_id = t.id), '')
  || ' ' ||
  COALESCE((SELECT string_agg(keyword, ' ' ORDER BY position) FROM catalog_title_keywords WHERE title_id = t.id), '')
)`;

const PEOPLE = `COALESCE((SELECT string_agg(person, ' ' ORDER BY position) FROM catalog_title_people WHERE title_id = t.id), '')`;

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

export function markTitlesForIndexing(db: Database, titleIds: string[], reason: IndexReason) {
  const unique = knownTitleIds(titleIds);

  if (unique.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    chunk(unique).map((wave) =>
      db.execute(
        `INSERT INTO catalog_index_pending (title_id, reason)
           SELECT value, $2
           FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value)
           WHERE true
           ON CONFLICT(title_id) DO NOTHING`,
        [JSON.stringify(wave), reason],
      ),
    ),
  ).then(() => undefined);
}

// The projection is rebuilt rather than patched: extension rows are written by their own
// repositories, so the only reliable snapshot is the one taken at reconciliation time.
export async function projectTitles(db: Database, titleIds: string[]) {
  const unique = knownTitleIds(titleIds);

  for (const wave of chunk(unique)) {
    const ids = JSON.stringify(wave);

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      const results = [];

      results.push(
        await transaction.execute(
          `INSERT INTO catalog_search (title, original_title, overview, tags, people, title_id)
           SELECT t.title, t.original_title, t.overview, ${TAGS}, ${PEOPLE}, t.id
           FROM catalog_titles AS t
           WHERE t.id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))
           ON CONFLICT (title_id) DO UPDATE SET
             title = excluded.title,
             original_title = excluded.original_title,
             overview = excluded.overview,
             tags = excluded.tags,
             people = excluded.people`,
          [ids],
        ),
      );
      results.push(
        await transaction.execute(
          `DELETE FROM catalog_index_pending WHERE title_id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))`,
          [ids],
        ),
      );

      return results;
    });
  }

  return unique.length;
}

export async function takePendingTitles(db: Database, limit: number) {
  const rows = await db.query<{ titleId: string }>(
    `SELECT title_id AS "titleId"
       FROM catalog_index_pending
       ORDER BY CASE reason WHEN 'title' THEN 0 WHEN 'extensions' THEN 1 ELSE 2 END, queued_at
       LIMIT $1`,
    [clamp(Math.trunc(limit), 1, 20_000)],
  );

  return rows.rows.map((row) => row.titleId);
}

export async function queueSearchRebuild(db: Database) {
  await db.execute(`INSERT INTO catalog_index_pending (title_id, reason)
       SELECT id, 'rebuild' FROM catalog_titles
       WHERE true
       ON CONFLICT(title_id) DO NOTHING`);

  const row = await db.first<{ pending: number }>(
    `SELECT count(*) AS pending FROM catalog_index_pending`,
  );

  return row?.pending ?? 0;
}

export async function sampleSearchDrift(db: Database, sampleSize = DRIFT_SAMPLE) {
  const size = clamp(Math.trunc(sampleSize), 100, 20_000);
  const row = await db.first<SearchIndexDrift>(
    `WITH sample AS (
         SELECT s.title_id, s.tags, s.people
           FROM catalog_search AS s TABLESAMPLE SYSTEM (${DRIFT_SAMPLE_PERCENT})
          LIMIT $1
       )
       SELECT count(*) AS sampled,
              count(*) FILTER (
                WHERE trim(sample.tags) IS DISTINCT FROM ${DRIFT_TAGS}
                   OR sample.people IS DISTINCT FROM ${DRIFT_PEOPLE}
              ) AS stale
         FROM sample`,
    [size],
  );

  return { sampled: row?.sampled ?? 0, stale: row?.stale ?? 0 };
}

export async function readSearchIndexState(db: Database): Promise<SearchIndexState> {
  const row = await db.first<SearchIndexState>(`SELECT
         ${estimatedRows("catalog_titles")} AS titles,
         ${estimatedRows("catalog_search")} AS indexed,
         (SELECT count(*) FROM catalog_index_pending) AS pending,
         (SELECT min(queued_at) FROM catalog_index_pending) AS "oldestPendingAt"`);

  return {
    titles: row?.titles ?? 0,
    indexed: row?.indexed ?? 0,
    pending: row?.pending ?? 0,
    oldestPendingAt: row?.oldestPendingAt ?? null,
  };
}
