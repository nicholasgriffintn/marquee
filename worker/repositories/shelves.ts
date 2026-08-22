import { isKnownTitle } from "../lib/validation.ts";
import { parseJson } from "../lib/values.ts";

export type PinnedShelf = {
  id: string;
  name: string;
  prompt: string;
  reason: string;
  titleIds: string[];
  createdAt: string;
};

type ShelfRow = {
  id: string;
  name: string;
  prompt: string;
  reason: string;
  titleIds: string;
  createdAt: string;
};

const MAX_SHELVES = 6;

export async function readPinnedShelves(db: D1Database, viewerId: string): Promise<PinnedShelf[]> {
  const rows = await db
    .prepare(
      `SELECT id, name, prompt, reason, title_ids AS titleIds, created_at AS createdAt
       FROM pinned_shelves
       WHERE viewer_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(viewerId, MAX_SHELVES)
    .all<ShelfRow>();

  return rows.results.map((row) => {
    const parsed = parseJson(row.titleIds);

    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      reason: row.reason,
      titleIds: Array.isArray(parsed) ? parsed.filter(isKnownTitle) : [],
      createdAt: row.createdAt,
    };
  });
}

export async function pinShelf(
  db: D1Database,
  viewerId: string,
  shelf: { name: string; prompt: string; reason: string; titleIds: string[] },
) {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO pinned_shelves (id, viewer_id, name, prompt, reason, title_ids)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, viewerId, shelf.name, shelf.prompt, shelf.reason, JSON.stringify(shelf.titleIds))
    .run();

  await db
    .prepare(
      `DELETE FROM pinned_shelves
       WHERE viewer_id = ?
         AND id NOT IN (
           SELECT id FROM pinned_shelves
           WHERE viewer_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         )`,
    )
    .bind(viewerId, viewerId, MAX_SHELVES)
    .run();

  return id;
}

export async function unpinShelf(db: D1Database, viewerId: string, id: string) {
  const result = await db
    .prepare(`DELETE FROM pinned_shelves WHERE viewer_id = ? AND id = ?`)
    .bind(viewerId, id)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
