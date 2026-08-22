import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";
import { readItems } from "./catalog-reader.ts";

type FieldsFor<S extends EnrichmentSource> = S extends "omdb"
  ? Pick<MediaTitle, "ratings">
  : Pick<MediaTitle, "externalIds">;

export async function storeEnrichment<S extends Exclude<EnrichmentSource, "watchmode">>(
  env: Bindings,
  titleId: string,
  source: S,
  fields: FieldsFor<S>,
) {
  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    return false;
  }

  const enrichedTitle = { ...title, ...fields } satisfies MediaTitle;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE catalog_titles
       SET payload = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(JSON.stringify(enrichedTitle), titleId),
    env.DB.prepare(
      `INSERT INTO title_enrichment (title_id, source, payload)
       VALUES (?, ?, ?)
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         fetched_at = CURRENT_TIMESTAMP`,
    ).bind(titleId, source, JSON.stringify(fields)),
  ]);

  return true;
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
     WHERE e.title_id IS NULL OR e.fetched_at < datetime('now', ?)
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
      `INSERT INTO title_enrichment (title_id, source, payload)
       VALUES (?, 'poster', ?)
       ON CONFLICT(title_id, source) DO UPDATE SET
         payload = excluded.payload,
         fetched_at = CURRENT_TIMESTAMP`,
    ).bind(titleId, JSON.stringify({ key, contentType })),
  ]);

  return true;
}
