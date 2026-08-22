import type { EntryStatus, ViewingContext } from "../types.ts";

type EntryRow = {
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
};

export async function readViewerContext(
  db: D1Database,
  viewerId: string,
  selectedProviderIds: string[] = [],
) {
  const entriesResult = await db
    .prepare(
      `SELECT title_id AS titleId, status, rating, thoughts FROM viewing_entries WHERE viewer_id = ? ORDER BY updated_at DESC LIMIT 100`,
    )
    .bind(viewerId)
    .all<EntryRow>();
  const entries: ViewingContext[] = entriesResult.results.map((entry) => ({
    titleId: entry.titleId,
    status: entry.status,
    rating: entry.rating,
    thoughts: entry.thoughts.slice(0, 500),
  }));

  return { entries, selectedProviderIds };
}

type AffinityRow = { value: string; weight: number };

async function affinityFor(db: D1Database, viewerId: string, path: string, limit: number) {
  const rows = await db
    .prepare(
      `SELECT json_each.value AS value,
              sum(CASE WHEN v.rating IS NULL THEN 1.0 ELSE v.rating / 2.5 END) AS weight
       FROM viewing_entries AS v
       JOIN catalog_titles AS t ON t.id = v.title_id, json_each(t.payload, ?)
       WHERE v.viewer_id = ? AND v.status != 'dropped'
       GROUP BY json_each.value
       ORDER BY weight DESC
       LIMIT ?`,
    )
    .bind(path, viewerId, limit)
    .all<AffinityRow>();

  return rows.results
    .filter((row) => typeof row.value === "string" && row.value)
    .map((row) => row.value);
}

export async function readViewerAffinity(db: D1Database, viewerId: string) {
  const [genres, keywords, people] = await Promise.all([
    affinityFor(db, viewerId, "$.genres", 6),
    affinityFor(db, viewerId, "$.keywords", 12),
    affinityFor(db, viewerId, "$.people", 8),
  ]);

  return { genres, keywords, people };
}

export async function readShelfDetail(db: D1Database, viewerId: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT t.title, t.year, v.status, v.rating, v.thoughts,
              json_extract(t.payload, '$.genres') AS genres
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
