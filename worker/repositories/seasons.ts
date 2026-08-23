import type { Episode, SeasonSummary } from "../../src/domain/seasons.ts";
import { isRecord, numberAt, parseJson, stringAt } from "../lib/values.ts";

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

const SELECT_COLUMNS = `season_number AS seasonNumber,
         name,
         overview,
         air_date AS airDate,
         episode_count AS episodeCount,
         poster_url AS posterUrl,
         payload,
         fetched_at AS fetchedAt,
         episodes_fetched_at AS episodesFetchedAt`;

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

export async function readStoredSeasons(db: D1Database, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM catalog_seasons
       WHERE title_id = ?
       ORDER BY season_number`,
    )
    .bind(titleId)
    .all<SeasonRow>();

  return rows.results.map(toStoredSeason);
}

export async function readStoredSeason(db: D1Database, titleId: string, seasonNumber: number) {
  const row = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM catalog_seasons
       WHERE title_id = ? AND season_number = ?`,
    )
    .bind(titleId, seasonNumber)
    .first<SeasonRow>();

  return row ? toStoredSeason(row) : null;
}

export async function writeSeasonSummaries(
  db: D1Database,
  titleId: string,
  seasons: SeasonSummary[],
) {
  if (seasons.length === 0) {
    return;
  }

  await db.batch(
    seasons.map((season) =>
      db
        .prepare(
          `INSERT INTO catalog_seasons
             (title_id, season_number, name, overview, air_date, episode_count, poster_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(title_id, season_number) DO UPDATE SET
             name = excluded.name,
             overview = excluded.overview,
             air_date = excluded.air_date,
             episode_count = MAX(excluded.episode_count, catalog_seasons.episode_count),
             poster_url = excluded.poster_url,
             fetched_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          titleId,
          season.seasonNumber,
          season.name,
          season.overview,
          season.airDate,
          season.episodeCount,
          season.posterUrl,
        ),
    ),
  );
}

export async function writeSeasonEpisodes(
  db: D1Database,
  titleId: string,
  season: SeasonSummary & { episodes: Episode[] },
) {
  await db
    .prepare(
      `INSERT INTO catalog_seasons
         (title_id, season_number, name, overview, air_date, episode_count, poster_url,
          payload, episodes_fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(title_id, season_number) DO UPDATE SET
         name = excluded.name,
         overview = excluded.overview,
         air_date = excluded.air_date,
         episode_count = excluded.episode_count,
         poster_url = excluded.poster_url,
         payload = excluded.payload,
         fetched_at = CURRENT_TIMESTAMP,
         episodes_fetched_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      titleId,
      season.seasonNumber,
      season.name,
      season.overview,
      season.airDate,
      season.episodes.length || season.episodeCount,
      season.posterUrl,
      JSON.stringify(season.episodes),
    )
    .run();
}
