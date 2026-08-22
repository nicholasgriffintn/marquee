import { isRecord } from "../lib/values.ts";
import type { EntryStatus } from "../types.ts";

export async function readProfile(db: D1Database, viewerId: string) {
  const entriesResult = await db
    .prepare(
      `SELECT
         id,
         title_id AS titleId,
         status,
         rating,
         thoughts,
         updated_at AS updatedAt
       FROM viewing_entries
       WHERE viewer_id = ?
       ORDER BY updated_at DESC`,
    )
    .bind(viewerId)
    .all();

  return {
    entries: entriesResult.results.filter(
      (entry) => isRecord(entry) && typeof entry.titleId === "string",
    ),
  };
}

export async function saveViewingEntry(
  db: D1Database,
  viewerId: string,
  entry: {
    titleId: string;
    status: EntryStatus;
    rating: number | null;
    thoughts: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO viewing_entries
         (id, viewer_id, title_id, status, rating, thoughts)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(viewer_id, title_id) DO UPDATE SET
         status = excluded.status,
         rating = excluded.rating,
         thoughts = excluded.thoughts,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(crypto.randomUUID(), viewerId, entry.titleId, entry.status, entry.rating, entry.thoughts)
    .run();

  return db
    .prepare(
      `SELECT
         id,
         title_id AS titleId,
         status,
         rating,
         thoughts,
         updated_at AS updatedAt
       FROM viewing_entries
       WHERE viewer_id = ? AND title_id = ?`,
    )
    .bind(viewerId, entry.titleId)
    .first();
}

export async function deleteViewingEntry(db: D1Database, viewerId: string, titleId: string) {
  await db
    .prepare(
      `DELETE FROM viewing_entries
       WHERE viewer_id = ? AND title_id = ?`,
    )
    .bind(viewerId, titleId)
    .run();
}
