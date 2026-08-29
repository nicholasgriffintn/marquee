import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { AnimeMapping } from "../clients/fribb.ts";
import { logEvent } from "../lib/logging.ts";
import { computeBlendedRating, computeWeightedRating } from "../lib/ratings.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";
import { persistTitleExtensions } from "./catalog-arrays.ts";
import { readRawItems } from "./catalog-reader.ts";
import { titleScalarColumns } from "./catalog-writer.ts";

type OmdbFields = Pick<MediaTitle, "ratings"> &
  Partial<
    Pick<
      MediaTitle,
      | "certification"
      | "runtimeMinutes"
      | "genres"
      | "releaseDate"
      | "year"
      | "overview"
      | "people"
      | "studios"
      | "countries"
      | "languages"
      | "numberOfSeasons"
      | "posterUrl"
    >
  >;

type FieldsFor<S extends EnrichmentSource> = S extends "omdb"
  ? OmdbFields
  : S extends "mal"
    ? Pick<MediaTitle, "keywords" | "ratings" | "anime"> &
        Partial<
          Pick<MediaTitle, "status" | "certification" | "lastAirDate" | "studios" | "posterUrl">
        >
    : S extends "anilist"
      ? Pick<MediaTitle, "anime">
      : Pick<MediaTitle, "externalIds">;

const MISS_BACKOFF_CAP_DAYS = 120;
const TRANSIENT_RETRY_HOURS = 1;
const TRANSIENT_RETRY_CAP_HOURS = 24;

export type EnrichmentWindow = { maxAgeDays: number; missBackoffDays: number };

export const ENRICHMENT_WINDOWS = {
  omdb: { maxAgeDays: 14, missBackoffDays: 10 },
  poster: { maxAgeDays: 365, missBackoffDays: 30 },
  mal: { maxAgeDays: 14, missBackoffDays: 3 },
  anilist: { maxAgeDays: 1, missBackoffDays: 3 },
} as const satisfies Record<string, EnrichmentWindow>;

export type EnrichedSource = keyof typeof ENRICHMENT_WINDOWS;

function updateTitleScalars(transaction: DatabaseTransaction, title: MediaTitle) {
  const scalars = titleScalarColumns(title);

  return transaction.execute(
    `UPDATE catalog_titles
       SET weighted_rating = $1, blended_rating = $2,
           overview = $3, runtime_minutes = $4, number_of_seasons = $5, release_date = $6,
           certification = $7, tmdb_score = $8, poster_url = $9, backdrop_url = $10,
           watch_link = $11, status = $12, original_language = $13, revenue = $14,
           collection_id = $15, collection_name = $16, mal_id = $17, anilist_id = $18,
           wikidata_id = $19, updated_at = CURRENT_TIMESTAMP
       WHERE id = $20`,
    [
      computeWeightedRating(title),
      computeBlendedRating(title),
      scalars.overview,
      scalars.runtimeMinutes,
      scalars.numberOfSeasons,
      scalars.releaseDate,
      scalars.certification,
      scalars.tmdbScore,
      scalars.posterUrl,
      scalars.backdropUrl,
      scalars.watchLink,
      scalars.status,
      scalars.originalLanguage,
      scalars.revenue,
      scalars.collectionId,
      scalars.collectionName,
      scalars.malId,
      scalars.anilistId,
      scalars.wikidataId,
      title.id,
    ],
  );
}

export async function storeEnrichment<S extends EnrichedSource>(
  env: Bindings,
  titleId: string,
  source: S,
  fields: FieldsFor<S>,
) {
  const title = (await readRawItems(env.DB, [titleId])).get(titleId);
  const enrichedTitle = title ? ({ ...title, ...fields } satisfies MediaTitle) : null;

  if (!enrichedTitle) {
    logEvent("enrichment_title_unreadable", { titleId, source });
  }

  const { maxAgeDays } = ENRICHMENT_WINDOWS[source];

  if (enrichedTitle) {
    await persistTitleExtensions(env.DB, [enrichedTitle]);
  }

  await env.DB.transaction(async (transaction) => {
    if (enrichedTitle) {
      await updateTitleScalars(transaction, enrichedTitle);
    }

    await transaction.execute(
      `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
       VALUES ($1, $2, $3, 0, 0, (CURRENT_TIMESTAMP + INTERVAL '${maxAgeDays} day'))
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         miss = 0,
         attempts = 0,
         fetched_at = CURRENT_TIMESTAMP,
         next_check_at = (CURRENT_TIMESTAMP + INTERVAL '${maxAgeDays} day')`,
      [titleId, source, JSON.stringify(fields)],
    );
  });

  return Boolean(enrichedTitle);
}

export async function storeEnrichmentMiss(
  env: Bindings,
  titleId: string,
  source: EnrichedSource,
  reason: string,
) {
  const { missBackoffDays } = ENRICHMENT_WINDOWS[source];

  await env.DB.execute(
    `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
     VALUES ($1, $2, $3, 1, 1, CURRENT_TIMESTAMP + LEAST(${missBackoffDays}, ${MISS_BACKOFF_CAP_DAYS}) * INTERVAL '1 day')
     ON CONFLICT(title_id, source) DO UPDATE SET
       payload = excluded.payload,
       miss = 1,
       attempts = title_enrichment.attempts + 1,
       fetched_at = CURRENT_TIMESTAMP,
       next_check_at = CURRENT_TIMESTAMP
         + LEAST((title_enrichment.attempts + 1) * ${missBackoffDays}, ${MISS_BACKOFF_CAP_DAYS})
           * INTERVAL '1 day'`,
    [titleId, source, JSON.stringify({ miss: reason })],
  );
}

export async function storeEnrichmentTransient(
  env: Bindings,
  titleId: string,
  source: EnrichedSource,
  reason: string,
) {
  await env.DB.execute(
    `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
     VALUES (
       $1, $2, $3, 2, 1,
       CURRENT_TIMESTAMP + LEAST(${TRANSIENT_RETRY_HOURS}, ${TRANSIENT_RETRY_CAP_HOURS}) * INTERVAL '1 hour'
     )
     ON CONFLICT(title_id, source) DO UPDATE SET
       payload = excluded.payload,
       miss = 2,
       attempts = title_enrichment.attempts + 1,
       fetched_at = CURRENT_TIMESTAMP,
       next_check_at = CURRENT_TIMESTAMP
         + LEAST(
             (title_enrichment.attempts + 1) * ${TRANSIENT_RETRY_HOURS},
             ${TRANSIENT_RETRY_CAP_HOURS}
           ) * INTERVAL '1 hour'`,
    [titleId, source, JSON.stringify({ transient: reason })],
  );
}

export async function storeAnimeIds(db: Database, mappings: AnimeMapping[]) {
  if (mappings.length === 0) {
    return 0;
  }

  return db.transaction(async (transaction) => {
    let written = 0;

    for (const mapping of mappings) {
      // oxlint-disable-next-line no-await-in-loop
      const titleUpdate = await transaction.execute(
        `UPDATE catalog_titles
         SET mal_id = COALESCE($1::integer, mal_id),
             anilist_id = COALESCE($2::integer, anilist_id),
             wikidata_id = COALESCE($3::text, wikidata_id),
             imdb_id = COALESCE($4::text, imdb_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
           AND (($1::integer IS NOT NULL AND mal_id IS DISTINCT FROM $1::integer)
             OR ($2::integer IS NOT NULL AND anilist_id IS DISTINCT FROM $2::integer)
             OR ($3::text IS NOT NULL AND wikidata_id IS DISTINCT FROM $3::text)
             OR ($4::text IS NOT NULL AND imdb_id IS DISTINCT FROM $4::text))`,
        [
          mapping.ids.malId ?? null,
          mapping.ids.anilistId ?? null,
          mapping.ids.wikidataId ?? null,
          mapping.ids.imdbId ?? null,
          mapping.titleId,
        ],
      );

      written += titleUpdate.rowCount;

      const ids = mapping.ids;
      const extras = [
        ids.tvdbId,
        ids.facebookId,
        ids.instagramId,
        ids.twitterId,
        ids.anidbId,
        ids.kitsuId,
        ids.aniSearchId,
        ids.animePlanetId,
        ids.livechartId,
        ids.animeNewsNetworkId,
        ids.animeCountdownId,
      ];

      if (extras.every((value) => value === undefined || value === null)) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO catalog_title_external_ids
             (title_id, tvdb_id, facebook_id, instagram_id, twitter_id, anidb_id, kitsu_id,
              ani_search_id, anime_planet_id, livechart_id, animenewsnetwork_id, animecountdown_id)
           SELECT $1::text, $2::integer, $3::text, $4::text, $5::text, $6::integer,
                  $7::integer, $8::integer, $9::text, $10::integer, $11::integer, $12::integer
             FROM catalog_titles WHERE id = $1
           ON CONFLICT (title_id) DO UPDATE SET
             tvdb_id = COALESCE(excluded.tvdb_id, catalog_title_external_ids.tvdb_id),
             facebook_id = COALESCE(excluded.facebook_id, catalog_title_external_ids.facebook_id),
             instagram_id = COALESCE(excluded.instagram_id, catalog_title_external_ids.instagram_id),
             twitter_id = COALESCE(excluded.twitter_id, catalog_title_external_ids.twitter_id),
             anidb_id = COALESCE(excluded.anidb_id, catalog_title_external_ids.anidb_id),
             kitsu_id = COALESCE(excluded.kitsu_id, catalog_title_external_ids.kitsu_id),
             ani_search_id = COALESCE(excluded.ani_search_id, catalog_title_external_ids.ani_search_id),
             anime_planet_id = COALESCE(excluded.anime_planet_id, catalog_title_external_ids.anime_planet_id),
             livechart_id = COALESCE(excluded.livechart_id, catalog_title_external_ids.livechart_id),
             animenewsnetwork_id = COALESCE(excluded.animenewsnetwork_id, catalog_title_external_ids.animenewsnetwork_id),
             animecountdown_id = COALESCE(excluded.animecountdown_id, catalog_title_external_ids.animecountdown_id)`,
        [
          mapping.titleId,
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
        ],
      );
    }

    return written;
  });
}

type CandidateRow = { titleId: string };

async function selectNeverEnriched(
  env: Bindings,
  source: EnrichmentSource,
  limit: number,
  extraCondition: string,
) {
  const rows = await env.DB.query<CandidateRow>(
    `SELECT t.id AS "titleId"
     FROM catalog_titles AS t
     WHERE NOT EXISTS (
       SELECT 1 FROM title_enrichment AS e WHERE e.source = $1 AND e.title_id = t.id
     )
     ${extraCondition}
     ORDER BY t.popularity DESC
     LIMIT $2`,
    [source, limit],
  );

  return rows.rows.map((row) => row.titleId);
}

async function selectDue(
  env: Bindings,
  source: EnrichmentSource,
  limit: number,
  extraCondition: string,
) {
  const rows = await env.DB.query<CandidateRow>(
    `SELECT t.id AS "titleId"
     FROM title_enrichment AS e
     JOIN catalog_titles AS t ON t.id = e.title_id
     WHERE e.source = $1
       AND e.next_check_at <= CURRENT_TIMESTAMP
       ${extraCondition}
     ORDER BY e.next_check_at ASC
     LIMIT $2`,
    [source, limit],
  );

  return rows.rows.map((row) => row.titleId);
}

async function selectCandidates(
  env: Bindings,
  source: EnrichmentSource,
  limit: number,
  extraCondition = "",
) {
  const neverEnriched = await selectNeverEnriched(env, source, limit, extraCondition);

  if (neverEnriched.length >= limit) {
    return neverEnriched;
  }

  const due = await selectDue(env, source, limit - neverEnriched.length, extraCondition);

  return [...neverEnriched, ...due];
}

export async function selectAnimeCandidates(env: Bindings, limit: number) {
  return selectCandidates(env, "mal", limit, "AND t.mal_id IS NOT NULL");
}

export async function selectAniListCandidates(env: Bindings, limit: number) {
  return selectCandidates(env, "anilist", limit, "AND t.anilist_id IS NOT NULL");
}

export async function selectUnenriched(env: Bindings, source: EnrichmentSource, limit: number) {
  return selectCandidates(env, source, limit);
}

export async function storeImdbId(db: Database, titleId: string, imdbId: string) {
  await db.execute(
    `UPDATE catalog_titles SET imdb_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [imdbId, titleId],
  );
}

export function posterKey(titleId: string) {
  return `posters/${titleId.replace(":", "-")}`;
}

export async function storePoster(
  env: Bindings,
  titleId: string,
  body: ArrayBuffer,
  contentType: string,
) {
  const key = posterKey(titleId);
  const { maxAgeDays } = ENRICHMENT_WINDOWS.poster;

  await env.MEDIA.put(key, body, { httpMetadata: { contentType } });

  await env.DB.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(
        `UPDATE catalog_titles
       SET poster_key = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND poster_key IS DISTINCT FROM $3`,
        [key, titleId, key],
      ),
    );
    results.push(
      await transaction.execute(
        `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
       VALUES ($1, 'poster', $2, 0, 0, (CURRENT_TIMESTAMP + INTERVAL '${maxAgeDays} day'))
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         miss = 0,
         attempts = 0,
         fetched_at = CURRENT_TIMESTAMP,
         next_check_at = (CURRENT_TIMESTAMP + INTERVAL '${maxAgeDays} day')`,
        [titleId, JSON.stringify({ key, contentType })],
      ),
    );

    return results;
  });

  return true;
}
