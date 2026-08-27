import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { AnimeMapping } from "../clients/fribb.ts";
import { logEvent } from "../lib/logging.ts";
import { computeBlendedRating, computeWeightedRating } from "../lib/ratings.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";
import { readRawItems } from "./catalog-reader.ts";

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

  await env.DB.batch([
    ...(enrichedTitle
      ? [
          env.DB.prepare(
            `UPDATE catalog_titles
             SET payload = ?, weighted_rating = ?, blended_rating = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(
            JSON.stringify(enrichedTitle),
            computeWeightedRating(enrichedTitle),
            computeBlendedRating(enrichedTitle),
            titleId,
          ),
        ]
      : []),
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

  const written = await db.batch(
    mappings.map((mapping) =>
      db
        .prepare(
          `UPDATE catalog_titles
           SET payload = json_set(
                 payload,
                 '$.externalIds',
                 json_patch(
                   COALESCE(json_extract(payload, '$.externalIds'), json('{}')),
                   json(?)
                 )
               ),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
             AND json_patch(
                   COALESCE(json_extract(payload, '$.externalIds'), json('{}')),
                   json(?)
                 ) <> COALESCE(json_extract(payload, '$.externalIds'), json('{}'))`,
        )
        .bind(JSON.stringify(mapping.ids), mapping.titleId, JSON.stringify(mapping.ids)),
    ),
  );

  return written.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
}

type CandidateRow = { titleId: string };

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
  return selectCandidates(
    env,
    "mal",
    limit,
    "AND json_extract(t.payload, '$.externalIds.malId') IS NOT NULL",
  );
}

export async function selectAniListCandidates(env: Bindings, limit: number) {
  return selectCandidates(
    env,
    "anilist",
    limit,
    "AND json_extract(t.payload, '$.externalIds.anilistId') IS NOT NULL",
  );
}

export async function selectUnenriched(env: Bindings, source: EnrichmentSource, limit: number) {
  return selectCandidates(env, source, limit);
}

export async function storeImdbId(db: D1Database, titleId: string, imdbId: string) {
  await db
    .prepare(
      `UPDATE catalog_titles
       SET payload = json_set(payload, '$.imdbUrl', ?),
           imdb_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(`https://www.imdb.com/title/${imdbId}/`, imdbId, titleId)
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
