import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { TitleIdentifiers } from "../../src/domain/identifiers.ts";
import { deleteByTitleIds, insertRows, queryChunked } from "./catalog-array-utils.ts";

type ExternalIdsRow = TitleIdentifiers & {
  titleId: string;
  tvdbId: number | null;
  facebookId: string | null;
  instagramId: string | null;
  twitterId: string | null;
  anidbId: number | null;
  kitsuId: number | null;
  aniSearchId: number | null;
  animePlanetId: string | null;
  livechartId: number | null;
  animeNewsNetworkId: number | null;
  animeCountdownId: number | null;
};

export async function readExternalIdsMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, tvdb_id AS tvdbId, facebook_id AS facebookId,
                instagram_id AS instagramId, twitter_id AS twitterId, anidb_id AS anidbId,
                kitsu_id AS kitsuId, ani_search_id AS aniSearchId, anime_planet_id AS animePlanetId,
                livechart_id AS livechartId, animenewsnetwork_id AS animeNewsNetworkId,
                animecountdown_id AS animeCountdownId, letterboxd_id AS letterboxdId,
                rotten_tomatoes_id AS rottenTomatoesId, metacritic_id AS metacriticId,
                trakt_id AS traktId
         FROM catalog_title_external_ids
         WHERE title_id IN (${wave.map(() => "?").join(",")})`,
      )
      .bind(...wave)
      .all<ExternalIdsRow>()
      .then((result) => result.results),
  );

  return new Map(rows.map(({ titleId, ...rest }) => [titleId, rest]));
}

export async function writeExternalIdsRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_external_ids",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title): unknown[][] => {
    const ids = title.externalIds;

    return ids
      ? [
          [
            title.id,
            ids.tvdbId ?? null,
            ids.facebookId ?? null,
            ids.instagramId ?? null,
            ids.twitterId ?? null,
            ids.anidbId ?? null,
            ids.kitsuId ?? null,
            ids.aniSearchId ?? null,
            ids.animePlanetId ?? null,
            ids.livechartId ?? null,
            ids.animeNewsNetworkId ?? null,
            ids.animeCountdownId ?? null,
            ids.letterboxdId ?? null,
            ids.rottenTomatoesId ?? null,
            ids.metacriticId ?? null,
            ids.traktId ?? null,
          ],
        ]
      : [];
  });

  await insertRows(
    db,
    16,
    6,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_external_ids
         (title_id, tvdb_id, facebook_id, instagram_id, twitter_id, anidb_id, kitsu_id,
          ani_search_id, anime_planet_id, livechart_id, animenewsnetwork_id, animecountdown_id,
          letterboxd_id, rotten_tomatoes_id, metacritic_id, trakt_id)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (title_id) DO UPDATE SET
         tvdb_id = excluded.tvdb_id, facebook_id = excluded.facebook_id,
         instagram_id = excluded.instagram_id, twitter_id = excluded.twitter_id,
         anidb_id = excluded.anidb_id, kitsu_id = excluded.kitsu_id,
         ani_search_id = excluded.ani_search_id, anime_planet_id = excluded.anime_planet_id,
         livechart_id = excluded.livechart_id, animenewsnetwork_id = excluded.animenewsnetwork_id,
         animecountdown_id = excluded.animecountdown_id, letterboxd_id = excluded.letterboxd_id,
         rotten_tomatoes_id = excluded.rotten_tomatoes_id,
         metacritic_id = excluded.metacritic_id, trakt_id = excluded.trakt_id`,
  );
}

export async function writeTitleIdentifierRows(
  db: D1Database,
  entries: { titleId: string; identifiers: TitleIdentifiers }[],
) {
  await insertRows(
    db,
    5,
    18,
    entries.map(({ titleId, identifiers }): unknown[] => [
      titleId,
      identifiers.letterboxdId,
      identifiers.rottenTomatoesId,
      identifiers.metacriticId,
      identifiers.traktId,
    ]),
    (chunk) =>
      `INSERT INTO catalog_title_external_ids
         (title_id, letterboxd_id, rotten_tomatoes_id, metacritic_id, trakt_id)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (title_id) DO UPDATE SET
         letterboxd_id = excluded.letterboxd_id,
         rotten_tomatoes_id = excluded.rotten_tomatoes_id,
         metacritic_id = excluded.metacritic_id,
         trakt_id = excluded.trakt_id`,
  );
}
