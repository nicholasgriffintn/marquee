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

const WATCHED_KEY_CHUNK = 90;

export type EpisodeEntryInput = {
  titleId: string;
  scope: EntryScope;
  season: number;
  episode: number;
  watched: boolean;
  rating: number | null;
  notes: string;
};

const SELECT_COLUMNS = `title_id AS "titleId",
         scope,
         season_number AS season,
         episode_number AS episode,
         watched,
         watched_at AS "watchedAt",
         rating,
         notes,
         updated_at AS "updatedAt"`;

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

export async function readEpisodeEntries(db: Database, viewerId: string, titleId: string) {
  const rows = await db.query<EntryRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM viewing_episode_entries
       WHERE viewer_id = $1 AND title_id = $2
       ORDER BY season_number, episode_number`,
    [viewerId, titleId],
  );

  return rows.rows.map(toEntry);
}

function upsertEntry(transaction: DatabaseTransaction, viewerId: string, entry: EpisodeEntryInput) {
  const episode = entry.scope === "season" ? SEASON_ENTRY_EPISODE : entry.episode;

  return transaction.execute(
    `INSERT INTO viewing_episode_entries
         (id, viewer_id, title_id, scope, season_number, episode_number,
          watched, watched_at, rating, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, $9, $10)
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
    [
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
    ],
  );
}

function deleteEntry(transaction: DatabaseTransaction, viewerId: string, entry: EpisodeEntryInput) {
  return transaction.execute(
    `DELETE FROM viewing_episode_entries
       WHERE viewer_id = $1 AND title_id = $2 AND scope = $3 AND season_number = $4 AND episode_number = $5`,
    [
      viewerId,
      entry.titleId,
      entry.scope,
      entry.season,
      entry.scope === "season" ? SEASON_ENTRY_EPISODE : entry.episode,
    ],
  );
}

function isEmpty(entry: EpisodeEntryInput) {
  return !entry.watched && entry.rating === null && entry.notes.trim().length === 0;
}

export async function saveEpisodeEntry(
  db: DatabaseTransaction,
  viewerId: string,
  entry: EpisodeEntryInput,
) {
  if (isEmpty(entry)) {
    await deleteEntry(db, viewerId, entry);

    return null;
  }

  await upsertEntry(db, viewerId, entry);

  const row = await db.first<EntryRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM viewing_episode_entries
       WHERE viewer_id = $1 AND title_id = $2 AND scope = $3 AND season_number = $4 AND episode_number = $5`,
    [
      viewerId,
      entry.titleId,
      entry.scope,
      entry.season,
      entry.scope === "season" ? SEASON_ENTRY_EPISODE : entry.episode,
    ],
  );

  return row ? toEntry(row) : null;
}

const WRITE_CHUNK = 40;

export async function setEpisodesWatched(
  db: Database,
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
    await db.transaction(async (transaction) => {
      for (const entry of wave) {
        if (watched) {
          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(
            `INSERT INTO viewing_episode_entries
                   (id, viewer_id, title_id, scope, season_number, episode_number, watched, watched_at)
                 VALUES ($1, $2, $3, 'episode', $4, $5, 1, CURRENT_TIMESTAMP)
                 ON CONFLICT(viewer_id, title_id, scope, season_number, episode_number) DO UPDATE SET
                   watched = 1,
                   watched_at = COALESCE(viewing_episode_entries.watched_at, CURRENT_TIMESTAMP),
                   updated_at = CURRENT_TIMESTAMP`,
            [crypto.randomUUID(), viewerId, titleId, entry.season, entry.episode],
          );
        } else {
          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(
            `UPDATE viewing_episode_entries
                 SET watched = 0, watched_at = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE viewer_id = $1 AND title_id = $2 AND scope = 'episode'
                   AND season_number = $3 AND episode_number = $4`,
            [viewerId, titleId, entry.season, entry.episode],
          );
        }
      }
    });
  }

  await db.execute(
    `DELETE FROM viewing_episode_entries
       WHERE viewer_id = $1 AND title_id = $2 AND scope = 'episode'
         AND watched = 0 AND rating IS NULL AND trim(notes) = ''`,
    [viewerId, titleId],
  );
}

export async function deleteEpisodeEntries(db: Database, viewerId: string, titleId: string) {
  await db.execute(`DELETE FROM viewing_episode_entries WHERE viewer_id = $1 AND title_id = $2`, [
    viewerId,
    titleId,
  ]);
}

export async function readWatchedEpisodeKeys(db: Database, viewerId: string, titleIds: string[]) {
  const unique = [...new Set(titleIds)];

  if (unique.length === 0) {
    return new Set<string>();
  }

  const keys = new Set<string>();

  for (let index = 0; index < unique.length; index += WATCHED_KEY_CHUNK) {
    const wave = unique.slice(index, index + WATCHED_KEY_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const rows = await db.query<{ titleId: string; season: number; episode: number }>(
      `SELECT title_id AS "titleId", season_number AS season, episode_number AS episode
           FROM viewing_episode_entries
          WHERE viewer_id = $1 AND scope = 'episode' AND watched = 1
            AND title_id IN (${wave.map((_, offset) => `$${offset + 2}`).join(",")})`,
      [viewerId, ...wave],
    );

    for (const row of rows.rows) {
      keys.add(`${row.titleId}:${row.season}:${row.episode}`);
    }
  }

  return keys;
}
