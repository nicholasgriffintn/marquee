import type { Episode, SeasonSummary } from "../../src/domain/seasons.ts";
import { isRecord, numberAt, parseJson, stringAt } from "../lib/values.ts";
import { furthestEpisodeColumns } from "./viewing-progress.ts";

type SeasonRow = {
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  episodeCount: number;
  posterUrl: string | null;
  payload: string;
  fetchedAt: string;
  episodesFetchedAt: string | null;
};

export type StoredSeason = SeasonSummary & {
  episodes: Episode[];
  fetchedAt: string;
  episodesFetchedAt: string | null;
};

const SELECT_COLUMNS = `season_number AS "seasonNumber",
         name,
         overview,
         air_date AS "airDate",
         episode_count AS "episodeCount",
         poster_url AS "posterUrl",
         payload,
         fetched_at AS "fetchedAt",
         episodes_fetched_at AS "episodesFetchedAt"`;

function parseEpisodes(payload: string, seasonNumber: number): Episode[] {
  const parsed = parseJson(payload);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((value): Episode[] => {
    if (!isRecord(value)) {
      return [];
    }

    const episodeNumber = numberAt(value, "episodeNumber");

    if (episodeNumber === null) {
      return [];
    }

    return [
      {
        seasonNumber: numberAt(value, "seasonNumber") ?? seasonNumber,
        episodeNumber,
        name: stringAt(value, "name") ?? `Episode ${episodeNumber}`,
        overview: stringAt(value, "overview") ?? "",
        airDate: stringAt(value, "airDate"),
        runtimeMinutes: numberAt(value, "runtimeMinutes"),
        stillUrl: stringAt(value, "stillUrl"),
        tmdbScore: numberAt(value, "tmdbScore"),
        tmdbVoteCount: numberAt(value, "tmdbVoteCount") ?? 0,
        imdbId: stringAt(value, "imdbId"),
        imdbScore: numberAt(value, "imdbScore"),
      },
    ];
  });
}

function toStoredSeason(row: SeasonRow): StoredSeason {
  return {
    seasonNumber: row.seasonNumber,
    name: row.name,
    overview: row.overview,
    airDate: row.airDate,
    episodeCount: row.episodeCount,
    posterUrl: row.posterUrl,
    episodes: parseEpisodes(row.payload, row.seasonNumber),
    fetchedAt: row.fetchedAt,
    episodesFetchedAt: row.episodesFetchedAt,
  };
}

export async function readStoredSeasons(db: Database, titleId: string) {
  const rows = await db.query<SeasonRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM catalog_seasons
       WHERE title_id = $1
       ORDER BY season_number`,
    [titleId],
  );

  return rows.rows.map(toStoredSeason);
}

export async function readStoredSeason(db: Database, titleId: string, seasonNumber: number) {
  const row = await db.first<SeasonRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM catalog_seasons
       WHERE title_id = $1 AND season_number = $2`,
    [titleId, seasonNumber],
  );

  return row ? toStoredSeason(row) : null;
}

export async function writeSeasonSummaries(
  db: Database,
  titleId: string,
  seasons: SeasonSummary[],
) {
  if (seasons.length === 0) {
    return;
  }

  await db.transaction(async (transaction) => {
    for (const season of seasons) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO catalog_seasons
             (title_id, season_number, name, overview, air_date, episode_count, poster_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT(title_id, season_number) DO UPDATE SET
             name = excluded.name,
             overview = excluded.overview,
             air_date = excluded.air_date,
             episode_count = GREATEST(excluded.episode_count, catalog_seasons.episode_count),
             poster_url = excluded.poster_url,
             fetched_at = CURRENT_TIMESTAMP`,
        [
          titleId,
          season.seasonNumber,
          season.name,
          season.overview,
          season.airDate,
          season.episodeCount,
          season.posterUrl,
        ],
      );
    }
  });
}

export async function writeSeasonEpisodes(
  db: Database,
  titleId: string,
  season: SeasonSummary & { episodes: Episode[] },
) {
  await db.execute(
    `INSERT INTO catalog_seasons
         (title_id, season_number, name, overview, air_date, episode_count, poster_url,
          payload, episodes_fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT(title_id, season_number) DO UPDATE SET
         name = excluded.name,
         overview = excluded.overview,
         air_date = excluded.air_date,
         episode_count = excluded.episode_count,
         poster_url = excluded.poster_url,
         payload = excluded.payload,
         fetched_at = CURRENT_TIMESTAMP,
         episodes_fetched_at = CURRENT_TIMESTAMP`,
    [
      titleId,
      season.seasonNumber,
      season.name,
      season.overview,
      season.airDate,
      season.episodes.length || season.episodeCount,
      season.posterUrl,
      JSON.stringify(season.episodes),
    ],
  );
}

export type UpcomingEpisode = Episode & {
  titleId: string;
  progressSeason: number | null;
  progressEpisode: number | null;
};

export async function readShelfEpisodes(db: Database, viewerId: string, limit = 200) {
  const rows = await db.query<{
    titleId: string;
    seasonNumber: number;
    payload: string;
    progressSeason: number | null;
    progressEpisode: number | null;
  }>(
    `SELECT s.title_id AS "titleId", s.season_number AS "seasonNumber", s.payload AS payload,
              ${furthestEpisodeColumns("v.viewer_id", "v.title_id", "progressSeason", "progressEpisode")}
         FROM catalog_seasons AS s
         JOIN viewing_entries AS v ON v.title_id = s.title_id AND v.viewer_id = $1
        WHERE v.status IN ('watching', 'watchlist')
          AND s.season_number > 0
        ORDER BY s.title_id, s.season_number
        LIMIT $2`,
    [viewerId, limit],
  );

  return rows.rows.flatMap((row): UpcomingEpisode[] =>
    parseEpisodes(row.payload, row.seasonNumber).map((episode) =>
      Object.assign(episode, {
        titleId: row.titleId,
        progressSeason: row.progressSeason,
        progressEpisode: row.progressEpisode,
      }),
    ),
  );
}
