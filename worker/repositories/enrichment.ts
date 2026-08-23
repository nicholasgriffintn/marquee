import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";
import { readRawItems } from "./catalog-reader.ts";

type FieldsFor<S extends EnrichmentSource> = S extends "omdb"
  ? Pick<MediaTitle, "ratings">
  : S extends "anilist"
    ? Pick<MediaTitle, "keywords" | "ratings">
    : Pick<MediaTitle, "externalIds">;

export async function storeEnrichment<S extends Exclude<EnrichmentSource, "watchmode">>(
  env: Bindings,
  titleId: string,
  source: S,
  fields: FieldsFor<S>,
) {
  const title = (await readRawItems(env.DB, [titleId])).get(titleId);
  const enrichedTitle = title ? ({ ...title, ...fields } satisfies MediaTitle) : null;

  if (!enrichedTitle) {
    console.log(JSON.stringify({ event: "enrichment_title_unreadable", titleId, source }));
  }

  await env.DB.batch([
    ...(enrichedTitle
      ? [
          env.DB.prepare(
            `UPDATE catalog_titles
             SET payload = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(JSON.stringify(enrichedTitle), titleId),
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

const MISS_BACKOFF_DAYS = 3;
const MISS_BACKOFF_CAP_DAYS = 120;

const DUE_FOR_ENRICHMENT = `e.title_id IS NULL
       OR (e.miss = 0 AND e.fetched_at < datetime('now', ?))
       OR (e.miss = 1
           AND e.fetched_at < datetime(
             'now',
             '-' || min(e.attempts * ${MISS_BACKOFF_DAYS}, ${MISS_BACKOFF_CAP_DAYS}) || ' days'
           ))`;

export async function selectAnilistCandidates(env: Bindings, maxAgeDays: number, limit: number) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM catalog_titles AS t
     LEFT JOIN title_enrichment AS e ON e.title_id = t.id AND e.source = 'anilist'
     WHERE json_extract(t.payload, '$.externalIds.anilistId') IS NOT NULL
       AND (${DUE_FOR_ENRICHMENT})
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(`-${maxAgeDays} days`, limit)
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}

export async function selectUnenriched(
  env: Bindings,
  source: EnrichmentSource,
  maxAgeDays: number,
  limit: number,
) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM catalog_titles AS t
     LEFT JOIN title_enrichment AS e
       ON e.title_id = t.id AND e.source = ?
     WHERE ${DUE_FOR_ENRICHMENT}
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(source, `-${maxAgeDays} days`, limit)
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
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
