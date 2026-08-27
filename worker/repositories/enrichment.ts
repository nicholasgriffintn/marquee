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

/**
 * Single source of truth for each source's enrichment scheduling window.
 * `queueEnrichment()` (worker/jobs/enrichment.ts) always calls the reader
 * functions below with these exact per-source constants, so the "due" instant
 * for a row can be computed once here at write time (`next_check_at`) instead
 * of being recomputed by scanning at read time. Keeping this map as the only
 * definition avoids the write-time and read-time windows drifting apart.
 */
export const ENRICHMENT_WINDOWS = {
  omdb: { maxAgeDays: 14, missBackoffDays: 10 },
  poster: { maxAgeDays: 365, missBackoffDays: 30 },
  mal: { maxAgeDays: 14, missBackoffDays: 3 },
  anilist: { maxAgeDays: 1, missBackoffDays: 3 },
} as const satisfies Record<string, EnrichmentWindow>;

export type EnrichedSource = keyof typeof ENRICHMENT_WINDOWS;

function updateTitleScalars(db: D1Database, title: MediaTitle) {
  const scalars = titleScalarColumns(title);

  return db
    .prepare(
      `UPDATE catalog_titles
       SET weighted_rating = ?, blended_rating = ?,
           overview = ?, runtime_minutes = ?, number_of_seasons = ?, release_date = ?,
           certification = ?, tmdb_score = ?, poster_url = ?, backdrop_url = ?,
           watch_link = ?, status = ?, original_language = ?, revenue = ?,
           collection_id = ?, collection_name = ?, mal_id = ?, anilist_id = ?,
           wikidata_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
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

  await env.DB.batch([
    ...(enrichedTitle ? [updateTitleScalars(env.DB, enrichedTitle)] : []),
    env.DB.prepare(
      `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
       VALUES (?, ?, ?, 0, 0, datetime('now', '+${maxAgeDays} days'))
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         miss = 0,
         attempts = 0,
         fetched_at = CURRENT_TIMESTAMP,
         next_check_at = datetime('now', '+${maxAgeDays} days')`,
    ).bind(titleId, source, JSON.stringify(fields)),
  ]);

  return Boolean(enrichedTitle);
}

export async function storeEnrichmentMiss(
  env: Bindings,
  titleId: string,
  source: EnrichedSource,
  reason: string,
) {
  const { missBackoffDays } = ENRICHMENT_WINDOWS[source];

  await env.DB.prepare(
    `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
     VALUES (?, ?, ?, 1, 1, datetime('now', '+' || min(${missBackoffDays}, ${MISS_BACKOFF_CAP_DAYS}) || ' days'))
     ON CONFLICT(title_id, source) DO UPDATE SET
       payload = excluded.payload,
       miss = 1,
       attempts = title_enrichment.attempts + 1,
       fetched_at = CURRENT_TIMESTAMP,
       next_check_at = datetime(
         'now',
         '+' || min((title_enrichment.attempts + 1) * ${missBackoffDays}, ${MISS_BACKOFF_CAP_DAYS}) || ' days'
       )`,
  )
    .bind(titleId, source, JSON.stringify({ miss: reason }))
    .run();
}

export async function storeEnrichmentTransient(
  env: Bindings,
  titleId: string,
  source: EnrichedSource,
  reason: string,
) {
  await env.DB.prepare(
    `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
     VALUES (
       ?, ?, ?, 2, 1,
       datetime('now', '+' || min(${TRANSIENT_RETRY_HOURS}, ${TRANSIENT_RETRY_CAP_HOURS}) || ' hours')
     )
     ON CONFLICT(title_id, source) DO UPDATE SET
       payload = excluded.payload,
       miss = 2,
       attempts = title_enrichment.attempts + 1,
       fetched_at = CURRENT_TIMESTAMP,
       next_check_at = datetime(
         'now',
         '+' || min((title_enrichment.attempts + 1) * ${TRANSIENT_RETRY_HOURS}, ${TRANSIENT_RETRY_CAP_HOURS})
           || ' hours'
       )`,
  )
    .bind(titleId, source, JSON.stringify({ transient: reason }))
    .run();
}

export async function storeAnimeIds(db: D1Database, mappings: AnimeMapping[]) {
  if (mappings.length === 0) {
    return 0;
  }

  const titleUpdates = mappings.map((mapping) =>
    db
      .prepare(
        `UPDATE catalog_titles
         SET mal_id = COALESCE(?1, mal_id),
             anilist_id = COALESCE(?2, anilist_id),
             wikidata_id = COALESCE(?3, wikidata_id),
             imdb_id = COALESCE(?4, imdb_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5
           AND ((?1 IS NOT NULL AND mal_id IS NOT ?1)
             OR (?2 IS NOT NULL AND anilist_id IS NOT ?2)
             OR (?3 IS NOT NULL AND wikidata_id IS NOT ?3)
             OR (?4 IS NOT NULL AND imdb_id IS NOT ?4))`,
      )
      .bind(
        mapping.ids.malId ?? null,
        mapping.ids.anilistId ?? null,
        mapping.ids.wikidataId ?? null,
        mapping.ids.imdbId ?? null,
        mapping.titleId,
      ),
  );

  const extensionUpserts = mappings.flatMap((mapping) => {
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
      return [];
    }

    return [
      db
        .prepare(
          `INSERT INTO catalog_title_external_ids
             (title_id, tvdb_id, facebook_id, instagram_id, twitter_id, anidb_id, kitsu_id,
              ani_search_id, anime_planet_id, livechart_id, animenewsnetwork_id, animecountdown_id)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
             FROM catalog_titles WHERE id = ?1
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
        )
        .bind(
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
        ),
    ];
  });

  const written = await db.batch([...titleUpdates, ...extensionUpserts]);

  return written
    .slice(0, titleUpdates.length)
    .reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
}

type CandidateRow = { titleId: string };

/**
 * Titles with no `title_enrichment` row yet for this source, ordered by
 * popularity. Driven by the `title_enrichment_source_title_idx (source,
 * title_id)` index for the NOT EXISTS check and the existing
 * `catalog_titles_popularity_idx` for ordering.
 */
async function selectNeverEnriched(
  env: Bindings,
  source: EnrichmentSource,
  limit: number,
  extraCondition: string,
) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM catalog_titles AS t
     WHERE NOT EXISTS (
       SELECT 1 FROM title_enrichment AS e WHERE e.source = ? AND e.title_id = t.id
     )
     ${extraCondition}
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(source, limit)
    .all<CandidateRow>();

  return rows.results.map((row) => row.titleId);
}

/**
 * Titles whose precomputed `next_check_at` has passed, ordered most-overdue
 * first. Driven by the `title_enrichment_next_check_idx (source,
 * next_check_at)` index.
 */
async function selectDue(
  env: Bindings,
  source: EnrichmentSource,
  limit: number,
  extraCondition: string,
) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM title_enrichment AS e
     JOIN catalog_titles AS t ON t.id = e.title_id
     WHERE e.source = ?
       AND e.next_check_at <= CURRENT_TIMESTAMP
       ${extraCondition}
     ORDER BY e.next_check_at ASC
     LIMIT ?`,
  )
    .bind(source, limit)
    .all<CandidateRow>();

  return rows.results.map((row) => row.titleId);
}

/**
 * Combines never-enriched and due candidates for a source, up to `limit`.
 * Never-enriched titles (ordered by popularity) take priority; due titles
 * (ordered most-overdue first) fill the remaining budget. This is a
 * deliberate change from the old single popularity-ordered list, which
 * interleaved both categories strictly by popularity — see the PR
 * description for why this trade-off is acceptable for job scheduling.
 */
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

export async function storeImdbId(db: D1Database, titleId: string, imdbId: string) {
  await db
    .prepare(`UPDATE catalog_titles SET imdb_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(imdbId, titleId)
    .run();
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

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE catalog_titles
       SET poster_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND poster_key IS NOT ?`,
    ).bind(key, titleId, key),
    env.DB.prepare(
      `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts, next_check_at)
       VALUES (?, 'poster', ?, 0, 0, datetime('now', '+${maxAgeDays} days'))
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         miss = 0,
         attempts = 0,
         fetched_at = CURRENT_TIMESTAMP,
         next_check_at = datetime('now', '+${maxAgeDays} days')`,
    ).bind(titleId, JSON.stringify({ key, contentType })),
  ]);

  return true;
}
