import { isRecord } from "../lib/values.ts";
import type { EntryStatus } from "../types.ts";
import { furthestEpisodeColumns } from "./viewing-progress.ts";

const PROGRESS_COLUMNS = furthestEpisodeColumns(
  "viewing_entries.viewer_id",
  "viewing_entries.title_id",
);

export async function readProfile(db: Database, viewerId: string) {
  const entriesResult = await db.query(
    `SELECT
         id,
         title_id AS "titleId",
         status,
         rating,
         thoughts,
         ${PROGRESS_COLUMNS},
         updated_at AS "updatedAt"
       FROM viewing_entries
       WHERE viewer_id = $1
       ORDER BY updated_at DESC`,
    [viewerId],
  );

  return {
    entries: entriesResult.rows.filter(
      (entry) => isRecord(entry) && typeof entry.titleId === "string",
    ),
  };
}

export async function saveViewingEntry(
  db: DatabaseTransaction,
  viewerId: string,
  entry: {
    titleId: string;
    status: EntryStatus;
    rating: number | null;
    thoughts: string;
  },
) {
  await db.execute(
    `INSERT INTO viewing_entries
         (id, viewer_id, title_id, status, rating, thoughts, last_watched_at,
          status_source, rating_source, projected_at)
       VALUES ($1, $2, $3, $4::text, $5::int, $6,
               CASE WHEN $4::text = 'watched' THEN CURRENT_TIMESTAMP ELSE NULL END,
               'marquee', CASE WHEN $5::int IS NULL THEN NULL ELSE 'marquee' END, CURRENT_TIMESTAMP)
       ON CONFLICT(viewer_id, title_id) DO UPDATE SET
         status = excluded.status,
         rating = excluded.rating,
         thoughts = excluded.thoughts,
         last_watched_at = CASE
           WHEN excluded.status = 'watched' THEN CURRENT_TIMESTAMP
           ELSE viewing_entries.last_watched_at
         END,
         status_source = 'marquee',
         rating_source = CASE WHEN excluded.rating IS NULL THEN NULL ELSE 'marquee' END,
         projected_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
    [crypto.randomUUID(), viewerId, entry.titleId, entry.status, entry.rating, entry.thoughts],
  );

  return db.first(
    `SELECT
         id,
         title_id AS "titleId",
         status,
         rating,
         thoughts,
         ${PROGRESS_COLUMNS},
         updated_at AS "updatedAt"
       FROM viewing_entries
       WHERE viewer_id = $1 AND title_id = $2`,
    [viewerId, entry.titleId],
  );
}

export async function deleteViewingEntry(db: Database, viewerId: string, titleId: string) {
  await db.execute(
    `DELETE FROM viewing_entries
       WHERE viewer_id = $1 AND title_id = $2`,
    [viewerId, titleId],
  );
}

export async function readProfileSummary(db: Database, viewerId: string) {
  const row = await db.first<{
    shelved: number;
    unrated: number | null;
    updatedAt: string;
  }>(
    `SELECT count(*) AS shelved,
              sum(CASE WHEN rating IS NULL THEN 1 ELSE 0 END) AS unrated,
              COALESCE(max(updated_at)::text, '') AS "updatedAt"
         FROM viewing_entries
        WHERE viewer_id = $1`,
    [viewerId],
  );

  return {
    shelved: row?.shelved ?? 0,
    unrated: row?.unrated ?? 0,
    updatedAt: row?.updatedAt ?? "",
  };
}

export async function readProviderPreferences(db: Database, viewerId: string) {
  const row = await db.first<{ selectedProviderIds: string }>(
    `SELECT selected_provider_ids AS "selectedProviderIds" FROM viewer_preferences WHERE viewer_id = $1`,
    [viewerId],
  );

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
  db: Database,
  viewerId: string,
  providerIds: string[],
) {
  await db.execute(
    `INSERT INTO viewer_preferences (viewer_id, selected_provider_ids)
       VALUES ($1, $2)
       ON CONFLICT(viewer_id) DO UPDATE SET
         selected_provider_ids = excluded.selected_provider_ids,
         updated_at = CURRENT_TIMESTAMP`,
    [viewerId, JSON.stringify(providerIds)],
  );
}

export async function readViewingEntry(db: Database, viewerId: string, titleId: string) {
  const row = await db.first(
    `SELECT id, title_id AS "titleId", status, rating, thoughts, ${PROGRESS_COLUMNS},
              updated_at AS "updatedAt"
         FROM viewing_entries
        WHERE viewer_id = $1 AND title_id = $2`,
    [viewerId, titleId],
  );

  return isRecord(row) && typeof row.titleId === "string" ? row : null;
}
