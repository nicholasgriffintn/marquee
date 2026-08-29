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

export async function readPinnedShelves(db: Database, viewerId: string): Promise<PinnedShelf[]> {
  const rows = await db.query<ShelfRow>(
    `SELECT id, name, prompt, reason, title_ids AS "titleIds", created_at AS "createdAt"
       FROM pinned_shelves
       WHERE viewer_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
    [viewerId, MAX_SHELVES],
  );

  return rows.rows.map((row) => {
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
  db: Database,
  viewerId: string,
  shelf: { name: string; prompt: string; reason: string; titleIds: string[] },
) {
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO pinned_shelves (id, viewer_id, name, prompt, reason, title_ids)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, viewerId, shelf.name, shelf.prompt, shelf.reason, JSON.stringify(shelf.titleIds)],
  );

  await db.execute(
    `DELETE FROM pinned_shelves
       WHERE viewer_id = $1
         AND id NOT IN (
           SELECT id FROM pinned_shelves
           WHERE viewer_id = $2
           ORDER BY created_at DESC
           LIMIT $3
         )`,
    [viewerId, viewerId, MAX_SHELVES],
  );

  return id;
}

export async function unpinShelf(db: Database, viewerId: string, id: string) {
  const result = await db.execute(`DELETE FROM pinned_shelves WHERE viewer_id = $1 AND id = $2`, [
    viewerId,
    id,
  ]);

  return (result.rowCount ?? 0) > 0;
}
