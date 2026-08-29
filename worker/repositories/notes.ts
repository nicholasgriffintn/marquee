import { logError } from "../lib/logging.ts";

export type ViewerNote = {
  id: string;
  title: string;
  rating: number | null;
  thoughts: string;
  notedAt: string;
};

const MIN_NOTE_LENGTH = 20;

const NOTE_SOURCE = `
  SELECT v.id AS id, t.title AS title, v.rating AS rating, v.thoughts AS thoughts,
         v.updated_at AS "notedAt"
    FROM viewing_entries AS v
    JOIN catalog_titles AS t ON t.id = v.title_id
   WHERE v.viewer_id = $1 AND length(trim(v.thoughts)) > ${MIN_NOTE_LENGTH} AND {filter:v}
  UNION ALL
  SELECT e.id AS id,
         t.title || ' S' || e.season_number ||
           CASE WHEN e.scope = 'episode' THEN 'E' || e.episode_number ELSE '' END AS title,
         e.rating AS rating, e.notes AS thoughts, e.updated_at AS "notedAt"
    FROM viewing_episode_entries AS e
    JOIN catalog_titles AS t ON t.id = e.title_id
   WHERE e.viewer_id = $1 AND length(trim(e.notes)) > ${MIN_NOTE_LENGTH} AND {filter:e}`;

function noteQuery(filter: (alias: string) => string) {
  return NOTE_SOURCE.replaceAll("{filter:v}", filter("v")).replaceAll("{filter:e}", filter("e"));
}

export async function readRecentNotes(
  db: Database,
  viewerId: string,
  limit: number,
): Promise<ViewerNote[]> {
  if (!viewerId) {
    return [];
  }

  try {
    const rows = await db.query<ViewerNote>(
      `SELECT * FROM (${noteQuery(() => "1 = 1")}) ORDER BY notedAt DESC LIMIT $2`,
      [viewerId, limit],
    );

    return rows.rows;
  } catch (error) {
    logError("notes_read_failed", error);

    return [];
  }
}

export async function readNotesByIds(
  db: Database,
  viewerId: string,
  ids: string[],
): Promise<ViewerNote[]> {
  if (!viewerId || ids.length === 0) {
    return [];
  }

  const placeholders = ids.map((_, index) => `$${index + 2}`).join(",");

  try {
    const rows = await db.query<ViewerNote>(
      `SELECT * FROM (${noteQuery((alias) => `${alias}.id IN (${placeholders})`)})
          ORDER BY notedAt DESC`,
      [viewerId, ...ids],
    );

    return rows.rows;
  } catch (error) {
    logError("notes_by_id_read_failed", error);

    return [];
  }
}
