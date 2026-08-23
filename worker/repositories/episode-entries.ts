import {
  SEASON_ENTRY_EPISODE,
  type EntryScope,
  type EpisodeEntry,
} from "../../src/domain/seasons.ts";

type EntryRow = {
  titleId: string;
  scope: EntryScope;
  season: number;
  episode: number;
  watched: number;
  watchedAt: string | null;
  rating: number | null;
  notes: string;
  updatedAt: string;
};

export type EpisodeEntryInput = {
  titleId: string;
  scope: EntryScope;
  season: number;
  episode: number;
  watched: boolean;
  rating: number | null;
  notes: string;
};

const SELECT_COLUMNS = `title_id AS titleId,
         scope,
         season_number AS season,
         episode_number AS episode,
         watched,
         watched_at AS watchedAt,
         rating,
         notes,
         updated_at AS updatedAt`;

function toEntry(row: EntryRow): EpisodeEntry {
  return {
    titleId: row.titleId,
    scope: row.scope,
    season: row.season,
    episode: row.episode,
    watched: row.watched === 1,
    watchedAt: row.watchedAt,
    rating: row.rating,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

export async function readEpisodeEntries(db: D1Database, viewerId: string, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM viewing_episode_entries
       WHERE viewer_id = ? AND title_id = ?
       ORDER BY season_number, episode_number`,
    )
    .bind(viewerId, titleId)
    .all<EntryRow>();

  return rows.results.map(toEntry);
}

export async function readWatchedEpisodes(db: D1Database, viewerId: string, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT season_number AS season, episode_number AS episode
       FROM viewing_episode_entries
       WHERE viewer_id = ? AND title_id = ? AND scope = 'episode' AND watched = 1
       ORDER BY season_number DESC, episode_number DESC`,
    )
    .bind(viewerId, titleId)
    .all<{ season: number; episode: number }>();

  return rows.results;
}

function statement(db: D1Database, viewerId: string, entry: EpisodeEntryInput) {
  const episode = entry.scope === "season" ? SEASON_ENTRY_EPISODE : entry.episode;

  return db
    .prepare(
      `INSERT INTO viewing_episode_entries
         (id, viewer_id, title_id, scope, season_number, episode_number,
          watched, watched_at, rating, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, ?, ?)
       ON CONFLICT(viewer_id, title_id, scope, season_number, episode_number) DO UPDATE SET
         watched = excluded.watched,
         watched_at = CASE
           WHEN excluded.watched = 0 THEN NULL
           WHEN viewing_episode_entries.watched_at IS NULL THEN CURRENT_TIMESTAMP
           ELSE viewing_episode_entries.watched_at
         END,
         rating = excluded.rating,
         notes = excluded.notes,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      crypto.randomUUID(),
      viewerId,
      entry.titleId,
      entry.scope,
      entry.season,
      episode,
      entry.watched ? 1 : 0,
      entry.watched ? 1 : 0,
      entry.rating,
      entry.notes,
    );
}

function deleteStatement(db: D1Database, viewerId: string, entry: EpisodeEntryInput) {
  return db
    .prepare(
      `DELETE FROM viewing_episode_entries
       WHERE viewer_id = ? AND title_id = ? AND scope = ? AND season_number = ? AND episode_number = ?`,
    )
    .bind(
      viewerId,
      entry.titleId,
      entry.scope,
      entry.season,
      entry.scope === "season" ? SEASON_ENTRY_EPISODE : entry.episode,
    );
}

function isEmpty(entry: EpisodeEntryInput) {
  return !entry.watched && entry.rating === null && entry.notes.trim().length === 0;
}

export async function saveEpisodeEntry(db: D1Database, viewerId: string, entry: EpisodeEntryInput) {
  if (isEmpty(entry)) {
    await deleteStatement(db, viewerId, entry).run();

    return null;
  }

  await statement(db, viewerId, entry).run();

  const row = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM viewing_episode_entries
       WHERE viewer_id = ? AND title_id = ? AND scope = ? AND season_number = ? AND episode_number = ?`,
    )
    .bind(
      viewerId,
      entry.titleId,
      entry.scope,
      entry.season,
      entry.scope === "season" ? SEASON_ENTRY_EPISODE : entry.episode,
    )
    .first<EntryRow>();

  return row ? toEntry(row) : null;
}

const WRITE_CHUNK = 40;

export async function setEpisodesWatched(
  db: D1Database,
  viewerId: string,
  titleId: string,
  season: number,
  episodes: number[],
  watched: boolean,
) {
  const inputs = episodes.map((episode): EpisodeEntryInput => ({
    titleId,
    scope: "episode",
    season,
    episode,
    watched,
    rating: null,
    notes: "",
  }));

  for (let index = 0; index < inputs.length; index += WRITE_CHUNK) {
    const wave = inputs.slice(index, index + WRITE_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    await db.batch(
      wave.map((entry) =>
        watched
          ? db
              .prepare(
                `INSERT INTO viewing_episode_entries
                   (id, viewer_id, title_id, scope, season_number, episode_number, watched, watched_at)
                 VALUES (?, ?, ?, 'episode', ?, ?, 1, CURRENT_TIMESTAMP)
                 ON CONFLICT(viewer_id, title_id, scope, season_number, episode_number) DO UPDATE SET
                   watched = 1,
                   watched_at = COALESCE(viewing_episode_entries.watched_at, CURRENT_TIMESTAMP),
                   updated_at = CURRENT_TIMESTAMP`,
              )
              .bind(crypto.randomUUID(), viewerId, titleId, entry.season, entry.episode)
          : db
              .prepare(
                `UPDATE viewing_episode_entries
                 SET watched = 0, watched_at = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE viewer_id = ? AND title_id = ? AND scope = 'episode'
                   AND season_number = ? AND episode_number = ?`,
              )
              .bind(viewerId, titleId, entry.season, entry.episode),
      ),
    );
  }

  await db
    .prepare(
      `DELETE FROM viewing_episode_entries
       WHERE viewer_id = ? AND title_id = ? AND scope = 'episode'
         AND watched = 0 AND rating IS NULL AND trim(notes) = ''`,
    )
    .bind(viewerId, titleId)
    .run();
}

export async function deleteEpisodeEntries(db: D1Database, viewerId: string, titleId: string) {
  await db
    .prepare(`DELETE FROM viewing_episode_entries WHERE viewer_id = ? AND title_id = ?`)
    .bind(viewerId, titleId)
    .run();
}

export async function readWatchedEpisodeKeys(db: D1Database, viewerId: string, limit = 2_000) {
  const rows = await db
    .prepare(
      `SELECT title_id AS titleId, season_number AS season, episode_number AS episode
         FROM viewing_episode_entries
        WHERE viewer_id = ?1 AND scope = 'episode' AND watched = 1
        LIMIT ?2`,
    )
    .bind(viewerId, limit)
    .all<{ titleId: string; season: number; episode: number }>();

  return new Set(rows.results.map((row) => `${row.titleId}:${row.season}:${row.episode}`));
}
