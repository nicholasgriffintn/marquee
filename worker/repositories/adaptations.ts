import type { MediaType } from "../../src/domain/catalog.ts";
import type { SourceWorkRecord } from "../clients/wikidata-adaptations.ts";
import { clamp } from "../lib/numbers.ts";

export type AdaptationCandidate = {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
};

export type ScannedTitle = { titleId: string; works: SourceWorkRecord[] };

export type StoredSourceWork = {
  workId: string;
  label: string;
  workType: string | null;
  publishedYear: number | null;
  authors: string[];
  adaptations: number;
};

export async function selectAdaptationCandidates(
  db: Database,
  limit: number,
  refreshDays: number,
  retryDays: number,
) {
  const rows = await db.query<AdaptationCandidate>(
    `SELECT t.id AS "titleId", t.media_type AS "mediaType", t.tmdb_id AS "tmdbId"
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_adaptation_scans AS s ON s.title_id = t.id
       WHERE s.title_id IS NULL
          OR s.scanned_at < CURRENT_TIMESTAMP
            + CAST(CASE WHEN s.works > 0 THEN $1 ELSE $2 END AS INTERVAL)
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT $3`,
    [`-${refreshDays} days`, `-${retryDays} days`, limit],
  );

  return rows.rows;
}

function sameIdSet(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

async function currentWorkLinks(db: Database, titleIds: string[], source: string) {
  const map = new Map<string, Set<string>>();

  if (titleIds.length === 0) {
    return map;
  }

  const rows = await db.query<{ titleId: string; workId: string }>(
    `SELECT title_id AS "titleId", work_id AS "workId"
       FROM title_source_works
       WHERE source = $1 AND title_id IN (${titleIds.map((_, index) => `$${index + 2}`).join(",")})`,
    [source, ...titleIds],
  );

  for (const row of rows.rows) {
    const set = map.get(row.titleId) ?? new Set<string>();

    set.add(row.workId);
    map.set(row.titleId, set);
  }

  return map;
}

async function currentWorkAuthors(db: Database, workIds: string[]) {
  const map = new Map<string, Set<string>>();

  if (workIds.length === 0) {
    return map;
  }

  const rows = await db.query<{ workId: string; name: string }>(
    `SELECT work_id AS "workId", name
       FROM source_work_authors
       WHERE work_id IN (${workIds.map((_, index) => `$${index + 1}`).join(",")})`,
    workIds,
  );

  for (const row of rows.rows) {
    const set = map.get(row.workId) ?? new Set<string>();

    set.add(row.name);
    map.set(row.workId, set);
  }

  return map;
}

export async function storeAdaptations(db: Database, source: string, scanned: ScannedTitle[]) {
  let written = 0;

  const linkedWorkIds = await currentWorkLinks(
    db,
    scanned.map((entry) => entry.titleId),
    source,
  );
  const workAuthors = await currentWorkAuthors(db, [
    ...new Set(scanned.flatMap((entry) => entry.works.map((work) => work.workId))),
  ]);

  for (const entry of scanned) {
    const incomingWorkIds = new Set(entry.works.map((work) => work.workId));
    const linksChanged = !sameIdSet(linkedWorkIds.get(entry.titleId) ?? new Set(), incomingWorkIds);

    // oxlint-disable-next-line no-await-in-loop
    written += await db.transaction(async (transaction) => {
      let statements = 1;

      if (linksChanged) {
        await transaction.execute(
          `DELETE FROM title_source_works WHERE title_id = $1 AND source = $2`,
          [entry.titleId, source],
        );
      }

      for (const work of entry.works) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO source_works
               (work_id, label, work_type, published_year, wikidata_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT(work_id) DO UPDATE SET
               label = excluded.label,
               work_type = excluded.work_type,
               published_year = excluded.published_year,
               wikidata_id = COALESCE(excluded.wikidata_id, source_works.wikidata_id),
               updated_at = CURRENT_TIMESTAMP`,
          [work.workId, work.label, work.workType, work.publishedYear, work.wikidataId],
        );
        statements += 1;

        const authorsChanged = !sameIdSet(
          workAuthors.get(work.workId) ?? new Set(),
          new Set(work.authors.map((author) => author.name)),
        );

        if (authorsChanged) {
          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(`DELETE FROM source_work_authors WHERE work_id = $1`, [
            work.workId,
          ]);
          statements += 1;

          for (const author of work.authors) {
            // oxlint-disable-next-line no-await-in-loop
            await transaction.execute(
              `INSERT INTO source_work_authors (work_id, name, wikidata_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT(work_id, name) DO UPDATE SET wikidata_id = excluded.wikidata_id`,
              [work.workId, author.name, author.wikidataId],
            );
            statements += 1;
          }
        }

        if (linksChanged) {
          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(
            `INSERT INTO title_source_works (title_id, work_id, source) VALUES ($1, $2, $3)
               ON CONFLICT(title_id, work_id, source) DO NOTHING`,
            [entry.titleId, work.workId, source],
          );
          statements += 1;
        }
      }

      await transaction.execute(
        `INSERT INTO title_adaptation_scans (title_id, source, works, scanned_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id, source) DO UPDATE SET
             works = excluded.works,
             scanned_at = CURRENT_TIMESTAMP`,
        [entry.titleId, source, entry.works.length],
      );

      return statements + 1;
    });
  }

  return written;
}

export async function readTitleSourceWorks(db: Database, titleId: string) {
  const rows = await db.query<Omit<StoredSourceWork, "authors">>(
    `SELECT w.work_id AS "workId", w.label, w.work_type AS "workType",
              w.published_year AS "publishedYear",
              (SELECT count(DISTINCT peer.title_id) FROM title_source_works AS peer
                WHERE peer.work_id = w.work_id) AS adaptations
       FROM title_source_works AS link
       JOIN source_works AS w ON w.work_id = link.work_id
       WHERE link.title_id = $1
       ORDER BY adaptations DESC, w.label`,
    [titleId],
  );

  if (rows.rows.length === 0) {
    return [];
  }

  const authors = await db.query<{ workId: string; name: string }>(
    `SELECT work_id AS "workId", name
       FROM source_work_authors
       WHERE work_id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))
       ORDER BY name`,
    [JSON.stringify(rows.rows.map((row) => row.workId))],
  );

  const byWork = new Map<string, string[]>();

  for (const author of authors.rows) {
    byWork.set(author.workId, [...(byWork.get(author.workId) ?? []), author.name]);
  }

  return rows.rows.map((row): StoredSourceWork => ({
    workId: row.workId,
    label: row.label,
    workType: row.workType,
    publishedYear: row.publishedYear,
    adaptations: row.adaptations,
    authors: byWork.get(row.workId) ?? [],
  }));
}

export async function readAdaptationTitleIds(db: Database, workId: string, limit: number) {
  const rows = await db.query<{ titleId: string }>(
    `SELECT link.title_id AS "titleId"
       FROM title_source_works AS link
       JOIN catalog_titles AS t ON t.id = link.title_id
       WHERE link.work_id = $1
       GROUP BY link.title_id, t.release_date, t.popularity
       ORDER BY COALESCE(t.release_date, '9999-12-31'), t.popularity DESC
       LIMIT $2`,
    [workId, clamp(limit, 1, 48)],
  );

  return rows.rows.map((row) => row.titleId);
}
