import type { AnimeDetails, MediaTitle } from "../../src/domain/catalog.ts";
import {
  deleteByTitleIds,
  insertRows,
  queryChunked,
  rowPlaceholders,
} from "./catalog-array-utils.ts";

export type AnimeCore = Omit<
  AnimeDetails,
  | "synonyms"
  | "relations"
  | "streams"
  | "characters"
  | "staff"
  | "openings"
  | "endings"
  | "licensors"
  | "producers"
  | "videos"
  | "recommendations"
  | "links"
>;

type AnimeCoreRow = {
  titleId: string;
  format: string | null;
  episodes: number | null;
  durationMinutes: number | null;
  season: string | null;
  seasonYear: number | null;
  source: string | null;
  romajiTitle: string | null;
  englishTitle: string | null;
  nativeTitle: string | null;
  broadcast: string | null;
  airing: number | null;
  background: string | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  keyVisualUrl: string | null;
  statusBreakdownWatching: number | null;
  statusBreakdownCompleted: number | null;
  statusBreakdownOnHold: number | null;
  statusBreakdownDropped: number | null;
  statusBreakdownPlanToWatch: number | null;
};

export async function readAnimeCoreMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<AnimeCoreRow>(
        `SELECT title_id AS "titleId", format, episodes, duration_minutes AS "durationMinutes",
                season, season_year AS "seasonYear", source, romaji_title AS "romajiTitle",
                english_title AS "englishTitle", native_title AS "nativeTitle", broadcast, airing,
                background, rank, popularity, members, favorites, key_visual_url AS "keyVisualUrl",
                status_breakdown_watching AS "statusBreakdownWatching",
                status_breakdown_completed AS "statusBreakdownCompleted",
                status_breakdown_on_hold AS "statusBreakdownOnHold",
                status_breakdown_dropped AS "statusBreakdownDropped",
                status_breakdown_plan_to_watch AS "statusBreakdownPlanToWatch"
         FROM catalog_title_anime
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})`,
        [...wave],
      )
      .then((result) => result.rows),
  );

  const values = new Map<string, AnimeCore>();

  for (const row of rows) {
    const hasBreakdown =
      row.statusBreakdownWatching !== null ||
      row.statusBreakdownCompleted !== null ||
      row.statusBreakdownOnHold !== null ||
      row.statusBreakdownDropped !== null ||
      row.statusBreakdownPlanToWatch !== null;

    values.set(row.titleId, {
      format: row.format,
      episodes: row.episodes,
      durationMinutes: row.durationMinutes,
      season: row.season,
      seasonYear: row.seasonYear,
      source: row.source,
      romajiTitle: row.romajiTitle,
      englishTitle: row.englishTitle,
      nativeTitle: row.nativeTitle,
      broadcast: row.broadcast,
      airing: row.airing === null ? undefined : Boolean(row.airing),
      background: row.background,
      rank: row.rank,
      popularity: row.popularity,
      members: row.members,
      favorites: row.favorites,
      keyVisualUrl: row.keyVisualUrl,
      statusBreakdown: hasBreakdown
        ? {
            watching: row.statusBreakdownWatching ?? 0,
            completed: row.statusBreakdownCompleted ?? 0,
            onHold: row.statusBreakdownOnHold ?? 0,
            dropped: row.statusBreakdownDropped ?? 0,
            planToWatch: row.statusBreakdownPlanToWatch ?? 0,
          }
        : null,
    });
  }

  return values;
}

export async function writeAnimeCoreRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime",
    titles.map((title) => title.id),
  );

  const withAnime = titles.filter((title): title is MediaTitle & { anime: AnimeDetails } =>
    Boolean(title.anime),
  );

  const rows = withAnime.map((title): DatabaseValue[] => {
    const anime = title.anime;

    return [
      title.id,
      anime.format,
      anime.episodes,
      anime.durationMinutes,
      anime.season,
      anime.seasonYear,
      anime.source,
      anime.romajiTitle,
      anime.englishTitle,
      anime.nativeTitle,
      anime.broadcast ?? null,
      anime.airing === undefined ? null : anime.airing ? 1 : 0,
      anime.background ?? null,
      anime.rank ?? null,
      anime.popularity ?? null,
      anime.members ?? null,
      anime.favorites ?? null,
      anime.keyVisualUrl ?? null,
      anime.statusBreakdown?.watching ?? null,
      anime.statusBreakdown?.completed ?? null,
      anime.statusBreakdown?.onHold ?? null,
      anime.statusBreakdown?.dropped ?? null,
      anime.statusBreakdown?.planToWatch ?? null,
    ];
  });

  await insertRows(
    db,
    23,
    3,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_anime
         (title_id, format, episodes, duration_minutes, season, season_year, source,
          romaji_title, english_title, native_title, broadcast, airing, background,
          rank, popularity, members, favorites, key_visual_url,
          status_breakdown_watching, status_breakdown_completed, status_breakdown_on_hold,
          status_breakdown_dropped, status_breakdown_plan_to_watch)
       VALUES ${rowPlaceholders(chunk.length, 23)}`,
  );
}
