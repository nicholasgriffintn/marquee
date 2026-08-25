import { isRecord } from "../lib/values.ts";
import type { EntryStatus } from "../types.ts";

const FURTHEST_EPISODE = `viewing_episode_entries
       WHERE viewer_id = viewing_entries.viewer_id AND title_id = viewing_entries.title_id
         AND scope = 'episode' AND watched = 1 AND season_number > 0
       ORDER BY season_number DESC, episode_number DESC LIMIT 1`;

const PROGRESS_COLUMNS = `(SELECT season_number FROM ${FURTHEST_EPISODE}) AS season,
         (SELECT episode_number FROM ${FURTHEST_EPISODE}) AS episode`;

export async function readProfile(db: D1Database, viewerId: string) {
  const entriesResult = await db
    .prepare(
      `SELECT
         id,
         title_id AS titleId,
         status,
         rating,
         thoughts,
         ${PROGRESS_COLUMNS},
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
         ${PROGRESS_COLUMNS},
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

export async function readProfileSummary(db: D1Database, viewerId: string) {
  const row = await db
    .prepare(
      `SELECT count(*) AS shelved,
              sum(CASE WHEN rating IS NULL THEN 1 ELSE 0 END) AS unrated,
              COALESCE(max(updated_at), '') AS updatedAt
         FROM viewing_entries
        WHERE viewer_id = ?`,
    )
    .bind(viewerId)
    .first<{ shelved: number; unrated: number | null; updatedAt: string }>();

  return {
    shelved: row?.shelved ?? 0,
    unrated: row?.unrated ?? 0,
    updatedAt: row?.updatedAt ?? "",
  };
}

export async function readProviderPreferences(db: D1Database, viewerId: string) {
  const row = await db
    .prepare(
      `SELECT selected_provider_ids AS selectedProviderIds FROM viewer_preferences WHERE viewer_id = ?`,
    )
    .bind(viewerId)
    .first<{ selectedProviderIds: string }>();

  if (!row) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(row.selectedProviderIds);

    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function saveProviderPreferences(
  db: D1Database,
  viewerId: string,
  providerIds: string[],
) {
  await db
    .prepare(
      `INSERT INTO viewer_preferences (viewer_id, selected_provider_ids)
       VALUES (?, ?)
       ON CONFLICT(viewer_id) DO UPDATE SET
         selected_provider_ids = excluded.selected_provider_ids,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(viewerId, JSON.stringify(providerIds))
    .run();
}

export async function readViewingEntry(db: D1Database, viewerId: string, titleId: string) {
  const row = await db
    .prepare(
      `SELECT id, title_id AS titleId, status, rating, thoughts, ${PROGRESS_COLUMNS},
              updated_at AS updatedAt
         FROM viewing_entries
        WHERE viewer_id = ?1 AND title_id = ?2`,
    )
    .bind(viewerId, titleId)
    .first();

  return isRecord(row) && typeof row.titleId === "string" ? row : null;
}
