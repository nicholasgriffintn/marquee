import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1_024;

const MAX_TEXT_LENGTH = 1_200;
const EMBED_BATCH = 25;

export function embeddingText(title: MediaTitle) {
  return [
    title.title,
    title.originalTitle === title.title ? "" : title.originalTitle,
    title.year ? String(title.year) : "",
    title.mediaType === "movie" ? "film" : "television series",
    title.genres.join(", "),
    (title.keywords ?? []).join(", "),
    (title.people ?? []).join(", "),
    title.overview,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, MAX_TEXT_LENGTH);
}

function parseVectors(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.data)) {
    return [];
  }

  return result.data.flatMap((vector): number[][] =>
    Array.isArray(vector) && vector.every((value) => typeof value === "number") ? [vector] : [],
  );
}

export async function embedTexts(env: Bindings, texts: string[]) {
  if (texts.length === 0) {
    return [];
  }

  const result = await env.AI.run(EMBEDDING_MODEL, {
    text: texts.map((text) => text.slice(0, MAX_TEXT_LENGTH)),
    truncate_inputs: true,
  });

  return parseVectors(result);
}

export async function embedQuery(env: Bindings, text: string) {
  const [vector] = await embedTexts(env, [text]);

  return vector ?? null;
}

export async function embedTitles(env: Bindings, titleIds: string[]) {
  const titles = await readItems(env.DB, titleIds, titleIds.length);

  if (titles.length === 0) {
    return 0;
  }

  let stored = 0;

  for (let index = 0; index < titles.length; index += EMBED_BATCH) {
    const wave = titles.slice(index, index + EMBED_BATCH);
    // oxlint-disable-next-line no-await-in-loop
    const vectors = await embedTexts(env, wave.map(embeddingText));

    if (vectors.length !== wave.length) {
      logError(
        "embedding_count_mismatch",
        new Error(`expected ${wave.length} vectors, received ${vectors.length}`),
      );
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    await env.VECTORS.upsert(
      wave.map((title, position) => ({
        id: title.id,
        values: vectors[position],
        metadata: {
          mediaType: title.mediaType,
          year: title.year ?? 0,
          popularity: Math.round(title.popularity),
        },
      })),
    );

    stored += wave.length;
  }

  await env.DB.batch(
    titles.map((title) =>
      env.DB.prepare(
        `INSERT INTO title_embeddings (title_id, model, embedded_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(title_id) DO UPDATE SET
           model = excluded.model,
           embedded_at = CURRENT_TIMESTAMP`,
      ).bind(title.id, EMBEDDING_MODEL),
    ),
  );

  console.log(JSON.stringify({ event: "titles_embedded", count: stored }));

  return stored;
}

export async function selectUnembedded(env: Bindings, limit: number) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId
     FROM catalog_titles AS t
     LEFT JOIN title_embeddings AS e ON e.title_id = t.id AND e.model = ?
     WHERE e.title_id IS NULL OR e.embedded_at < t.updated_at
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(EMBEDDING_MODEL, Math.max(1, Math.min(5_000, limit)))
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}

export async function similarTo(env: Bindings, titleId: string, topK = 24) {
  try {
    const matches = await env.VECTORS.queryById(titleId, { topK, returnMetadata: false });

    return matches.matches.filter((match) => match.id !== titleId).map((match) => match.id);
  } catch (error) {
    logError("vector_similar_failed", error, { titleId });

    return [];
  }
}
