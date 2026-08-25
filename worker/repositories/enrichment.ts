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
  : S extends "jikan"
    ? Pick<MediaTitle, "keywords" | "ratings" | "anime"> &
        Partial<Pick<MediaTitle, "status" | "lastAirDate" | "studios" | "posterUrl">>
    : Pick<MediaTitle, "externalIds">;

export async function storeEnrichment<S extends EnrichmentSource>(
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
      `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts)
       VALUES (?, ?, ?, 0, 0)
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         miss = 0,
         attempts = 0,
         fetched_at = CURRENT_TIMESTAMP`,
    ).bind(titleId, source, JSON.stringify(fields)),
  ]);

  return Boolean(enrichedTitle);
}

export async function storeEnrichmentMiss(
  env: Bindings,
  titleId: string,
  source: EnrichmentSource,
  reason: string,
) {
  await env.DB.prepare(
    `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts)
     VALUES (?, ?, ?, 1, 1)
     ON CONFLICT(title_id, source) DO UPDATE SET
       payload = excluded.payload,
       miss = 1,
       attempts = title_enrichment.attempts + 1,
       fetched_at = CURRENT_TIMESTAMP`,
  )
    .bind(titleId, source, JSON.stringify({ miss: reason }))
    .run();
}

export async function storeEnrichmentTransient(
  env: Bindings,
  titleId: string,
  source: EnrichmentSource,
  reason: string,
) {
  await env.DB.prepare(
    `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts)
     VALUES (?, ?, ?, 2, 1)
     ON CONFLICT(title_id, source) DO UPDATE SET
       payload = excluded.payload,
       miss = 2,
       attempts = title_enrichment.attempts + 1,
       fetched_at = CURRENT_TIMESTAMP`,
  )
    .bind(titleId, source, JSON.stringify({ transient: reason }))
    .run();
}

const MISS_BACKOFF_CAP_DAYS = 120;
const TRANSIENT_RETRY_HOURS = 1;

export type EnrichmentWindow = { maxAgeDays: number; missBackoffDays: number };

function dueForEnrichment(window: EnrichmentWindow) {
  return `e.title_id IS NULL
       OR (e.miss = 0 AND e.fetched_at < datetime('now', ?))
       OR (e.miss = 1
           AND e.fetched_at < datetime(
             'now',
             '-' || min(e.attempts * ${window.missBackoffDays}, ${MISS_BACKOFF_CAP_DAYS}) || ' days'
           ))
       OR (e.miss = 2 AND e.fetched_at < datetime('now', '-${TRANSIENT_RETRY_HOURS} hours'))`;
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

export async function selectAnimeCandidates(
  env: Bindings,
  window: EnrichmentWindow,
  limit: number,
) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM catalog_titles AS t
     LEFT JOIN title_enrichment AS e ON e.title_id = t.id AND e.source = 'jikan'
     WHERE json_extract(t.payload, '$.externalIds.malId') IS NOT NULL
       AND (${dueForEnrichment(window)})
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(`-${window.maxAgeDays} days`, limit)
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}

export async function selectUnenriched(
  env: Bindings,
  source: EnrichmentSource,
  window: EnrichmentWindow,
  limit: number,
) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM catalog_titles AS t
     LEFT JOIN title_enrichment AS e
       ON e.title_id = t.id AND e.source = ?
     WHERE ${dueForEnrichment(window)}
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(source, `-${window.maxAgeDays} days`, limit)
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
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

  await env.MEDIA.put(key, body, { httpMetadata: { contentType } });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE catalog_titles
       SET poster_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(key, titleId),
    env.DB.prepare(
      `INSERT INTO title_enrichment (title_id, source, payload, miss, attempts)
       VALUES (?, 'poster', ?, 0, 0)
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         miss = 0,
         attempts = 0,
         fetched_at = CURRENT_TIMESTAMP`,
    ).bind(titleId, JSON.stringify({ key, contentType })),
  ]);

  return true;
}
