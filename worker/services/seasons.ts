import {
  hasAired,
  type Episode,
  type EpisodeEntry,
  type SeasonDetail,
  type SeasonSummary,
  type ShowProgress,
} from "../../src/domain/seasons.ts";
import { getOmdbSeason, type OmdbEpisode } from "../clients/omdb.ts";
import { getTmdbSeason, getTmdbSeasonSummaries } from "../clients/tmdb.ts";
import { withRateLimitPause } from "../jobs/sources.ts";
import { logError } from "../lib/logging.ts";
import { databaseDate } from "../lib/values.ts";
import { claimBudget } from "../repositories/budgets.ts";
import { storeCredits } from "../repositories/catalog-writer.ts";
import {
  readEpisodeEntries,
  readWatchedEpisodes,
  saveEpisodeEntry,
  setEpisodesWatched,
  type EpisodeEntryInput,
} from "../repositories/episode-entries.ts";
import {
  readStoredSeason,
  readStoredSeasons,
  writeSeasonEpisodes,
  writeSeasonSummaries,
  type StoredSeason,
} from "../repositories/seasons.ts";
import type { Bindings } from "../types.ts";

const INDEX_TTL_HOURS = 12;
const RUNNING_TTL_HOURS = 12;
const SETTLED_TTL_HOURS = 24 * 30;
const RECENT_AIRING_DAYS = 14;

function tmdbIdOf(titleId: string) {
  return Number(titleId.split(":")[1]);
}

function hoursSince(stamp: string | null) {
  if (!stamp) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = databaseDate(stamp).getTime();

  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : (Date.now() - parsed) / 3_600_000;
}

function isSeasonSettled(episodes: Episode[]) {
  const window = RECENT_AIRING_DAYS * 86_400_000;

  return episodes.every(
    (episode) =>
      episode.airDate !== null && Date.parse(`${episode.airDate}T00:00:00Z`) < Date.now() - window,
  );
}

function summaryOf(season: StoredSeason): SeasonSummary {
  return {
    seasonNumber: season.seasonNumber,
    name: season.name,
    overview: season.overview,
    airDate: season.airDate,
    episodeCount: season.episodeCount,
    posterUrl: season.posterUrl,
  };
}

export async function getSeasonIndex(env: Bindings, titleId: string) {
  const stored = await readStoredSeasons(env.DB, titleId);
  const freshest = stored.reduce(
    (latest, season) => Math.min(latest, hoursSince(season.fetchedAt)),
    Number.POSITIVE_INFINITY,
  );

  if (stored.length > 0 && freshest < INDEX_TTL_HOURS) {
    return { seasons: stored.map(summaryOf), source: "TMDB" as const };
  }

  try {
    const seasons = await getTmdbSeasonSummaries(env, tmdbIdOf(titleId));

    if (seasons.length === 0) {
      return { seasons: stored.map(summaryOf), source: "TMDB" as const };
    }

    await writeSeasonSummaries(env.DB, titleId, seasons);

    return { seasons, source: "TMDB" as const };
  } catch (error) {
    logError("season_index_failed", error, { area: "seasons" });

    return { seasons: stored.map(summaryOf), source: "TMDB" as const };
  }
}

async function imdbIdOf(env: Bindings, titleId: string) {
  const row = await env.DB.prepare(`SELECT imdb_id AS imdbId FROM catalog_titles WHERE id = ?`)
    .bind(titleId)
    .first<{ imdbId: string | null }>();

  return row?.imdbId ?? null;
}

async function omdbEpisodes(env: Bindings, imdbId: string, seasonNumber: number) {
  try {
    const attempt = await withRateLimitPause(env, "omdb", () =>
      getOmdbSeason(env, imdbId, seasonNumber),
    );

    return new Map(
      attempt.limited ? [] : attempt.value.map((episode) => [episode.episodeNumber, episode]),
    );
  } catch (error) {
    logError("season_imdb_ratings_failed", error, { area: "seasons" });

    return new Map<number, OmdbEpisode>();
  }
}

async function withImdbRatings<T extends SeasonSummary & { episodes: Episode[] }>(
  env: Bindings,
  titleId: string,
  season: T,
): Promise<T> {
  if (!env.OMDB_API_KEY || season.episodes.length === 0) {
    return season;
  }

  const imdbId = await imdbIdOf(env, titleId);

  if (!imdbId || !(await claimBudget(env, "omdb"))) {
    return season;
  }

  const rated = await omdbEpisodes(env, imdbId, season.seasonNumber);

  if (rated.size === 0) {
    return season;
  }

  return {
    ...season,
    episodes: season.episodes.map((episode) => {
      const found = rated.get(episode.episodeNumber);

      return found
        ? {
            ...episode,
            imdbId: found.imdbId,
            imdbScore: found.imdbScore,
          }
        : episode;
    }),
  };
}

export async function getSeason(
  env: Bindings,
  titleId: string,
  seasonNumber: number,
): Promise<SeasonDetail | null> {
  const stored = await readStoredSeason(env.DB, titleId, seasonNumber);
  const age = hoursSince(stored?.episodesFetchedAt ?? null);
  const ttl = stored && isSeasonSettled(stored.episodes) ? SETTLED_TTL_HOURS : RUNNING_TTL_HOURS;

  if (stored && stored.episodes.length > 0 && age < ttl) {
    return {
      ...summaryOf(stored),
      episodes: stored.episodes,
      source: "TMDB",
      fetchedAt: stored.episodesFetchedAt ?? stored.fetchedAt,
    };
  }

  try {
    const fetched = await getTmdbSeason(env, tmdbIdOf(titleId), seasonNumber);
    const season = await withImdbRatings(env, titleId, fetched.season);

    await writeSeasonEpisodes(env.DB, titleId, season);

    if (fetched.credits) {
      await storeCredits(env.DB, [fetched.credits]);
    }

    return { ...season, source: "TMDB", fetchedAt: new Date().toISOString() };
  } catch (error) {
    logError("season_read_failed", error, { area: "seasons" });

    if (!stored) {
      return null;
    }

    return {
      ...summaryOf(stored),
      episodes: stored.episodes,
      source: "TMDB",
      fetchedAt: stored.episodesFetchedAt ?? stored.fetchedAt,
    };
  }
}

function airedCount(season: StoredSeason) {
  if (season.episodes.length > 0) {
    return season.episodes.filter((episode) => hasAired(episode.airDate)).length;
  }

  return hasAired(season.airDate) ? season.episodeCount : 0;
}

function airedNumbers(season: StoredSeason) {
  if (season.episodes.length > 0) {
    return season.episodes
      .filter((episode) => hasAired(episode.airDate))
      .map((episode) => ({ season: episode.seasonNumber, episode: episode.episodeNumber }));
  }

  return Array.from({ length: airedCount(season) }, (_, index) => ({
    season: season.seasonNumber,
    episode: index + 1,
  }));
}

function slotKey(slot: { season: number; episode: number }) {
  return `${slot.season}:${slot.episode}`;
}

export async function getShowProgress(
  db: D1Database,
  viewerId: string,
  titleId: string,
): Promise<ShowProgress> {
  const [stored, entries] = await Promise.all([
    readStoredSeasons(db, titleId),
    readEpisodeEntries(db, viewerId, titleId),
  ]);
  const watched = entries.filter((entry) => entry.scope === "episode" && entry.watched);
  const byKey = new Set(watched.map(slotKey));
  const counted = stored.filter((season) => season.seasonNumber > 0);
  const seasons = counted.map((season) => {
    const inSeason = watched.filter((entry) => entry.season === season.seasonNumber);
    const ratings = entries.flatMap((entry) =>
      entry.season === season.seasonNumber && entry.scope === "episode" && entry.rating
        ? [entry.rating]
        : [],
    );

    return {
      season: season.seasonNumber,
      episodes: season.episodes.length || season.episodeCount,
      aired: airedCount(season),
      watched: inSeason.length,
      rated: ratings.length,
      noted: entries.filter(
        (entry) => entry.season === season.seasonNumber && entry.notes.trim().length > 0,
      ).length,
      averageRating: ratings.length
        ? Math.round((ratings.reduce((total, score) => total + score, 0) / ratings.length) * 10) /
          10
        : null,
    };
  });
  const ordered = watched.toSorted(
    (left, right) => right.season - left.season || right.episode - left.episode,
  );
  const furthest = ordered[0] ? { season: ordered[0].season, episode: ordered[0].episode } : null;
  const upNext =
    counted.flatMap((season) => airedNumbers(season)).find((slot) => !byKey.has(slotKey(slot))) ??
    null;

  return {
    titleId,
    watched: watched.filter((entry) => entry.season > 0).length,
    aired: seasons.reduce((total, season) => total + season.aired, 0),
    seasons,
    furthest,
    upNext,
  };
}

async function syncShelfProgress(db: D1Database, viewerId: string, titleId: string) {
  const [watched, stored] = await Promise.all([
    readWatchedEpisodes(db, viewerId, titleId),
    readStoredSeasons(db, titleId),
  ]);
  const counted = watched.filter((entry) => entry.season > 0);
  const aired = stored
    .filter((season) => season.seasonNumber > 0)
    .reduce((total, season) => total + airedCount(season), 0);
  const isComplete = aired > 0 && counted.length >= aired;
  const status = counted.length === 0 ? "watchlist" : isComplete ? "watched" : "watching";

  await db
    .prepare(
      `INSERT INTO viewing_entries (id, viewer_id, title_id, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(viewer_id, title_id) DO UPDATE SET
         status = CASE
           WHEN viewing_entries.status IN ('watchlist', 'watching') THEN excluded.status
           ELSE viewing_entries.status
         END,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(crypto.randomUUID(), viewerId, titleId, status)
    .run();
}

export async function recordEpisodeEntry(
  db: D1Database,
  viewerId: string,
  input: EpisodeEntryInput,
) {
  const entry = await saveEpisodeEntry(db, viewerId, input);

  await syncShelfProgress(db, viewerId, input.titleId);

  return entry;
}

export async function markEpisodes(
  env: Bindings,
  viewerId: string,
  titleId: string,
  season: number,
  watched: boolean,
  through: number | null,
) {
  const detail = await getSeason(env, titleId, season);

  if (!detail) {
    return null;
  }

  const numbers = detail.episodes
    .filter(
      (episode) =>
        hasAired(episode.airDate) && (through === null || episode.episodeNumber <= through),
    )
    .map((episode) => episode.episodeNumber);

  await setEpisodesWatched(env.DB, viewerId, titleId, season, numbers, watched);
  await syncShelfProgress(env.DB, viewerId, titleId);

  return numbers.length;
}

export async function readViewerEpisodes(
  db: D1Database,
  viewerId: string,
  titleId: string,
): Promise<{ entries: EpisodeEntry[]; progress: ShowProgress }> {
  const [entries, progress] = await Promise.all([
    readEpisodeEntries(db, viewerId, titleId),
    getShowProgress(db, viewerId, titleId),
  ]);

  return { entries, progress };
}
