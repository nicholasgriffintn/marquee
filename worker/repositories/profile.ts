import { validProviderIds } from "../lib/validation.ts";
import { isRecord, parseJson } from "../lib/values.ts";
import type { EntryStatus } from "../types.ts";

type PreferenceRow = { selectedProviderIds: string };

export async function readProfile(db: D1Database, viewerId: string) {
  const [entriesResult, preference] = await Promise.all([
    db
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
      .all(),
    db
      .prepare(
        `SELECT selected_provider_ids AS selectedProviderIds
         FROM viewer_preferences
         WHERE viewer_id = ?
         LIMIT 1`,
      )
      .bind(viewerId)
      .first<PreferenceRow>(),
  ]);

  return {
    entries: entriesResult.results.filter(
      (entry) => isRecord(entry) && typeof entry.titleId === "string",
    ),
    selectedProviderIds: preference
      ? validProviderIds(parseJson(preference.selectedProviderIds))
      : null,
  };
}

export async function saveProviderPreferences(
  db: D1Database,
  viewerId: string,
  selectedProviderIds: string[],
) {
  await db
    .prepare(
      `INSERT INTO viewer_preferences (viewer_id, selected_provider_ids)
       VALUES (?, ?)
       ON CONFLICT(viewer_id) DO UPDATE SET
         selected_provider_ids = excluded.selected_provider_ids,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(viewerId, JSON.stringify(selectedProviderIds))
    .run();
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
