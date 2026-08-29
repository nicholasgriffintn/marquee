import { entryWeightSql } from "../services/viewer/weights.ts";
import type { EntryStatus, ViewingContext } from "../types.ts";

type EntryRow = {
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
  updatedAt: string;
};

export async function readViewerEntries(
  db: D1Database,
  viewerId: string,
): Promise<ViewingContext[]> {
  const entriesResult = await db
    .prepare(
      `SELECT title_id AS titleId, status, rating, thoughts, updated_at AS updatedAt FROM viewing_entries WHERE viewer_id = ? ORDER BY updated_at DESC LIMIT 100`,
    )
    .bind(viewerId)
    .all<EntryRow>();

  return entriesResult.results.map((entry) => ({
    titleId: entry.titleId,
    status: entry.status,
    rating: entry.rating,
    thoughts: entry.thoughts.slice(0, 500),
    updatedAt: entry.updatedAt,
  }));
}

type AffinityRow = { value: string; weight: number };

const AFFINITY_WEIGHT = entryWeightSql("v.status", "v.rating");

function toAffinityValues(rows: AffinityRow[]) {
  return rows.filter((row) => typeof row.value === "string" && row.value).map((row) => row.value);
}

async function affinityForTable(
  db: D1Database,
  viewerId: string,
  table: "catalog_title_genres" | "catalog_title_keywords" | "catalog_title_people",
  column: "genre" | "keyword" | "person",
  limit: number,
) {
  const rows = await db
    .prepare(
      `SELECT f.${column} AS value, sum(${AFFINITY_WEIGHT}) AS weight
       FROM viewing_entries AS v
       JOIN ${table} AS f ON f.title_id = v.title_id
       WHERE v.viewer_id = ?
       GROUP BY f.${column}
       HAVING sum(${AFFINITY_WEIGHT}) > 0
       ORDER BY weight DESC
       LIMIT ?`,
    )
    .bind(viewerId, limit)
    .all<AffinityRow>();

  return toAffinityValues(rows.results);
}

export async function readViewerAffinity(db: D1Database, viewerId: string) {
  const [genres, keywords, people] = await Promise.all([
    affinityForTable(db, viewerId, "catalog_title_genres", "genre", 6),
    affinityForTable(db, viewerId, "catalog_title_keywords", "keyword", 12),
    affinityForTable(db, viewerId, "catalog_title_people", "person", 8),
  ]);

  return { genres, keywords, people };
}

export async function readShelfDetail(db: D1Database, viewerId: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT t.title, t.year, v.status, v.rating, v.thoughts,
              (SELECT json_group_array(genre) FROM
                (SELECT genre FROM catalog_title_genres
                  WHERE title_id = t.id ORDER BY position)) AS genres
       FROM viewing_entries AS v
       JOIN catalog_titles AS t ON t.id = v.title_id
       WHERE v.viewer_id = ?
       ORDER BY v.rating DESC NULLS LAST, v.updated_at DESC
       LIMIT ?`,
    )
    .bind(viewerId, limit)
    .all<{
      title: string;
      year: number | null;
      status: string;
      rating: number | null;
      thoughts: string;
      genres: string | null;
    }>();

  return rows.results;
}
