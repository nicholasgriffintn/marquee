import type { MediaType } from "../../src/domain/catalog.ts";
import type { SourceWorkRecord } from "../clients/wikidata-adaptations.ts";
import { clamp } from "../lib/numbers.ts";

const WRITE_CHUNK = 50;

export type AdaptationCandidate = { titleId: string; mediaType: MediaType; tmdbId: number };

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
  db: D1Database,
  limit: number,
  refreshDays: number,
  retryDays: number,
) {
  const rows = await db
    .prepare(
      `SELECT t.id AS titleId, t.media_type AS mediaType, t.tmdb_id AS tmdbId
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_adaptation_scans AS s ON s.title_id = t.id
       WHERE s.title_id IS NULL
          OR s.scanned_at < datetime('now', CASE WHEN s.works > 0 THEN ?1 ELSE ?2 END)
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT ?3`,
    )
    .bind(`-${refreshDays} days`, `-${retryDays} days`, limit)
    .all<AdaptationCandidate>();

  return rows.results;
}

export async function storeAdaptations(db: D1Database, source: string, scanned: ScannedTitle[]) {
  const statements: D1PreparedStatement[] = [];

  for (const entry of scanned) {
    statements.push(
      db
        .prepare(`DELETE FROM title_source_works WHERE title_id = ? AND source = ?`)
        .bind(entry.titleId, source),
    );

    for (const work of entry.works) {
      statements.push(
        db
          .prepare(
            `INSERT INTO source_works
               (work_id, label, work_type, published_year, wikidata_id, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(work_id) DO UPDATE SET
               label = excluded.label,
               work_type = excluded.work_type,
               published_year = excluded.published_year,
               wikidata_id = COALESCE(excluded.wikidata_id, source_works.wikidata_id),
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(work.workId, work.label, work.workType, work.publishedYear, work.wikidataId),
        db.prepare(`DELETE FROM source_work_authors WHERE work_id = ?`).bind(work.workId),
        ...work.authors.map((author) =>
          db
            .prepare(
              `INSERT INTO source_work_authors (work_id, name, wikidata_id)
               VALUES (?, ?, ?)
               ON CONFLICT(work_id, name) DO UPDATE SET wikidata_id = excluded.wikidata_id`,
            )
            .bind(work.workId, author.name, author.wikidataId),
        ),
        db
          .prepare(
            `INSERT INTO title_source_works (title_id, work_id, source) VALUES (?, ?, ?)
             ON CONFLICT(title_id, work_id, source) DO NOTHING`,
          )
          .bind(entry.titleId, work.workId, source),
      );
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO title_adaptation_scans (title_id, source, works, scanned_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id, source) DO UPDATE SET
             works = excluded.works,
             scanned_at = CURRENT_TIMESTAMP`,
        )
        .bind(entry.titleId, source, entry.works.length),
    );
  }

  for (let index = 0; index < statements.length; index += WRITE_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(statements.slice(index, index + WRITE_CHUNK));
  }

  return statements.length;
}

export async function readTitleSourceWorks(db: D1Database, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT w.work_id AS workId, w.label, w.work_type AS workType,
              w.published_year AS publishedYear,
              (SELECT count(DISTINCT peer.title_id) FROM title_source_works AS peer
                WHERE peer.work_id = w.work_id) AS adaptations
       FROM title_source_works AS link
       JOIN source_works AS w ON w.work_id = link.work_id
       WHERE link.title_id = ?
       ORDER BY adaptations DESC, w.label`,
    )
    .bind(titleId)
    .all<Omit<StoredSourceWork, "authors">>();

  if (rows.results.length === 0) {
    return [];
  }

  const authors = await db
    .prepare(
      `SELECT work_id AS workId, name
       FROM source_work_authors
       WHERE work_id IN (SELECT value FROM json_each(?))
       ORDER BY name`,
    )
    .bind(JSON.stringify(rows.results.map((row) => row.workId)))
    .all<{ workId: string; name: string }>();

  const byWork = new Map<string, string[]>();

  for (const author of authors.results) {
    byWork.set(author.workId, [...(byWork.get(author.workId) ?? []), author.name]);
  }

  return rows.results.map((row): StoredSourceWork => ({
    workId: row.workId,
    label: row.label,
    workType: row.workType,
    publishedYear: row.publishedYear,
    adaptations: row.adaptations,
    authors: byWork.get(row.workId) ?? [],
  }));
}

export async function readAdaptationTitleIds(db: D1Database, workId: string, limit: number) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT link.title_id AS titleId
       FROM title_source_works AS link
       JOIN catalog_titles AS t ON t.id = link.title_id
       WHERE link.work_id = ?1
       ORDER BY COALESCE(t.release_date, '9999-12-31'), t.popularity DESC
       LIMIT ?2`,
    )
    .bind(workId, clamp(limit, 1, 48))
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}
