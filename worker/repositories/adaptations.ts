import type { MediaType } from "../../src/domain/catalog.ts";
import type { SourceWorkRecord } from "../clients/wikidata-adaptations.ts";
import { clamp } from "../lib/numbers.ts";

const WRITE_CHUNK = 50;

export type AdaptationCandidate = { titleId: string; mediaType: MediaType; tmdbId: number };

export type ScannedTitle = { titleId: string; works: SourceWorkRecord[] };

export type StoredSourceWork = {
  entityId: string;
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

export async function storeAdaptations(db: D1Database, scanned: ScannedTitle[]) {
  const statements: D1PreparedStatement[] = [];

  for (const entry of scanned) {
    statements.push(
      db.prepare(`DELETE FROM title_source_works WHERE title_id = ?`).bind(entry.titleId),
    );

    for (const work of entry.works) {
      statements.push(
        db
          .prepare(
            `INSERT INTO source_works (entity_id, label, work_type, published_year, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(entity_id) DO UPDATE SET
               label = excluded.label,
               work_type = excluded.work_type,
               published_year = excluded.published_year,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(work.entityId, work.label, work.workType, work.publishedYear),
        db.prepare(`DELETE FROM source_work_authors WHERE work_entity_id = ?`).bind(work.entityId),
        ...work.authors.map((author) =>
          db
            .prepare(
              `INSERT INTO source_work_authors (work_entity_id, author_entity_id, name)
               VALUES (?, ?, ?)
               ON CONFLICT(work_entity_id, author_entity_id) DO UPDATE SET name = excluded.name`,
            )
            .bind(work.entityId, author.entityId, author.name),
        ),
        db
          .prepare(
            `INSERT INTO title_source_works (title_id, work_entity_id) VALUES (?, ?)
             ON CONFLICT(title_id, work_entity_id) DO NOTHING`,
          )
          .bind(entry.titleId, work.entityId),
      );
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO title_adaptation_scans (title_id, works, scanned_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id) DO UPDATE SET
             works = excluded.works,
             scanned_at = CURRENT_TIMESTAMP`,
        )
        .bind(entry.titleId, entry.works.length),
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
      `SELECT w.entity_id AS entityId, w.label, w.work_type AS workType,
              w.published_year AS publishedYear,
              (SELECT count(*) FROM title_source_works AS peer
                WHERE peer.work_entity_id = w.entity_id) AS adaptations
       FROM title_source_works AS link
       JOIN source_works AS w ON w.entity_id = link.work_entity_id
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
      `SELECT work_entity_id AS entityId, name
       FROM source_work_authors
       WHERE work_entity_id IN (SELECT value FROM json_each(?))
       ORDER BY name`,
    )
    .bind(JSON.stringify(rows.results.map((row) => row.entityId)))
    .all<{ entityId: string; name: string }>();

  const byWork = new Map<string, string[]>();

  for (const author of authors.results) {
    byWork.set(author.entityId, [...(byWork.get(author.entityId) ?? []), author.name]);
  }

  return rows.results.map((row): StoredSourceWork => ({
    entityId: row.entityId,
    label: row.label,
    workType: row.workType,
    publishedYear: row.publishedYear,
    adaptations: row.adaptations,
    authors: byWork.get(row.entityId) ?? [],
  }));
}

export async function readAdaptationTitleIds(db: D1Database, entityId: string, limit: number) {
  const rows = await db
    .prepare(
      `SELECT link.title_id AS titleId
       FROM title_source_works AS link
       JOIN catalog_titles AS t ON t.id = link.title_id
       WHERE link.work_entity_id = ?1
       ORDER BY COALESCE(t.release_date, '9999-12-31'), t.popularity DESC
       LIMIT ?2`,
    )
    .bind(entityId, clamp(limit, 1, 48))
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}
