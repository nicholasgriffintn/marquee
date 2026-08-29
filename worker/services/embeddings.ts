import type { MediaTitle } from "../../src/domain/catalog.ts";
import { sha256Hex } from "../lib/hash.ts";
import { errorMessage, logError, logEvent } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { isRecord, vectorValues } from "../lib/values.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { CatalogueSearch } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";
import { queryTitleVectors, titleVectorMetadata } from "./vector-index.ts";

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";

const MAX_TEXT_LENGTH = 1_200;
const EMBED_BATCH = 25;

function embeddingText(title: MediaTitle) {
  return [
    title.title,
    title.originalTitle === title.title ? "" : title.originalTitle,
    title.year ? String(title.year) : "",
    title.mediaType === "movie" ? "film" : "television series",
    title.genres.join(", "),
    (title.keywords ?? []).join(", "),
    (title.people ?? []).join(", "),
    (title.studios ?? []).join(", "),
    title.overview,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, MAX_TEXT_LENGTH);
}

function contentHash(text: string) {
  return sha256Hex(text, 16);
}

function parseVectors(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.data)) {
    return [];
  }

  return result.data.flatMap((vector): number[][] =>
    Array.isArray(vector) && vector.every((value) => typeof value === "number") ? [vector] : [],
  );
}

async function embedTexts(env: Bindings, texts: string[]) {
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

const RETRY_MINUTES = 30;
const MAX_RETRY_MINUTES = 24 * 60;

function markEmbedded(db: DatabaseTransaction, titleId: string, hash: string) {
  return db.execute(
    `INSERT INTO title_embeddings (title_id, model, content_hash, embedded_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(title_id) DO UPDATE SET
       model = excluded.model,
       content_hash = excluded.content_hash,
       embedded_at = CURRENT_TIMESTAMP,
       attempts = 0,
       next_attempt_at = NULL,
       error = NULL`,
    [titleId, EMBEDDING_MODEL, hash],
  );
}

// A failed title keeps a marker so the next selection can step over it instead of
// re-reading the same head of the popularity queue on every sweep.
function markEmbeddingFailure(db: DatabaseTransaction, titleId: string, reason: string) {
  return db.execute(
    `INSERT INTO title_embeddings
       (title_id, model, content_hash, attempts, next_attempt_at, error)
     VALUES ($1, $2, NULL, 1, (CURRENT_TIMESTAMP + INTERVAL '${RETRY_MINUTES} minute'), $3)
     ON CONFLICT(title_id) DO UPDATE SET
       model = excluded.model,
       content_hash = NULL,
       attempts = title_embeddings.attempts + 1,
       next_attempt_at = CURRENT_TIMESTAMP
         + LEAST(${MAX_RETRY_MINUTES}, ${RETRY_MINUTES} * (title_embeddings.attempts + 1))
           * INTERVAL '1 minute',
       error = excluded.error`,
    [titleId, EMBEDDING_MODEL, reason.slice(0, 200)],
  );
}

function recordFailures(env: Bindings, titles: MediaTitle[], reason: string) {
  return env.DB.transaction(async (transaction) => {
    for (const title of titles) {
      await markEmbeddingFailure(transaction, title.id, reason);
    }
  });
}

async function storedHashes(env: Bindings, titleIds: string[]) {
  const rows = await env.DB.query<{ titleId: string; contentHash: string | null }>(
    `SELECT title_id AS "titleId", content_hash AS "contentHash"
     FROM title_embeddings
     WHERE model = $1 AND title_id IN (${titleIds.map((_, index) => `$${index + 2}`).join(", ")})`,
    [EMBEDDING_MODEL, ...titleIds],
  );

  return new Map(rows.rows.map((row) => [row.titleId, row.contentHash]));
}

export async function embedTitles(
  env: Bindings,
  titleIds: string[],
  options: { force?: boolean } = {},
) {
  const titles = await readItems(env.DB, titleIds, titleIds.length);

  if (titles.length === 0) {
    return 0;
  }

  const hashes = await Promise.all(titles.map((title) => contentHash(embeddingText(title))));
  const known = await storedHashes(
    env,
    titles.map((title) => title.id),
  );
  const stale = (title: MediaTitle, index: number) =>
    options.force === true || known.get(title.id) !== hashes[index];
  const pending = titles.filter(stale);
  const unchanged = titles.filter((title, index) => !stale(title, index));
  const hashById = new Map(titles.map((title, index) => [title.id, hashes[index]]));
  let stored = 0;
  let failed = 0;

  for (let index = 0; index < pending.length; index += EMBED_BATCH) {
    const wave = pending.slice(index, index + EMBED_BATCH);

    try {
      // oxlint-disable-next-line no-await-in-loop
      const vectors = await embedTexts(env, wave.map(embeddingText));

      if (vectors.length !== wave.length) {
        throw new Error(`expected ${wave.length} vectors, received ${vectors.length}`);
      }

      // oxlint-disable-next-line no-await-in-loop
      await env.VECTORS.upsert(
        wave.map((title, position) => ({
          id: title.id,
          values: vectors[position],
          metadata: titleVectorMetadata(title),
        })),
      );

      // oxlint-disable-next-line no-await-in-loop
      await env.DB.transaction(async (transaction) => {
        for (const title of wave) {
          await markEmbedded(transaction, title.id, hashById.get(title.id) as string);
        }
      });

      stored += wave.length;
    } catch (error) {
      logError("embedding_wave_failed", error, { titles: wave.length });
      failed += wave.length;
      // oxlint-disable-next-line no-await-in-loop
      await recordFailures(env, wave, errorMessage(error, 200));
    }
  }

  if (unchanged.length) {
    await env.DB.transaction(async (transaction) => {
      for (const title of unchanged) {
        await markEmbedded(transaction, title.id, hashById.get(title.id) as string);
      }
    });
  }

  logEvent("titles_embedded", { count: stored, skipped: unchanged.length, failed });

  // The backoff marker keeps the next selection moving; the throw keeps the run log and the
  // queue's own retry honest about the failure.
  if (failed > 0) {
    throw new Error(`${failed} of ${pending.length} titles could not be embedded`);
  }

  return stored;
}

const VECTOR_READ_BATCH = 20;

export async function readVectors(env: Bindings, titleIds: string[]) {
  const unique = [...new Set(titleIds)];
  const byId = new Map<string, number[]>();

  for (let index = 0; index < unique.length; index += VECTOR_READ_BATCH) {
    const wave = unique.slice(index, index + VECTOR_READ_BATCH);
    // oxlint-disable-next-line no-await-in-loop
    const vectors = await env.VECTORS.getByIds(wave);

    for (const vector of vectors) {
      const values = vectorValues(vector.values);

      if (values) {
        byId.set(vector.id, values);
      }
    }
  }

  return byId;
}

const OUTSTANDING = `(
  e.title_id IS NULL
  OR e.content_hash IS NULL
  OR e.embedded_at < t.updated_at
)`;

const OFF_BACKOFF = `(e.next_attempt_at IS NULL OR e.next_attempt_at <= CURRENT_TIMESTAMP)`;

const REINDEX_BATCH = 25;

async function selectEmbeddedAfter(env: Bindings, after: string, limit: number) {
  const rows = await env.DB.query<{ titleId: string }>(
    `SELECT title_id AS "titleId"
     FROM title_embeddings
     WHERE model = $1 AND title_id > $2
     ORDER BY title_id
     LIMIT $3`,
    [EMBEDDING_MODEL, after, clamp(limit, 1, 100)],
  );

  return rows.rows.map((row) => row.titleId);
}

export async function reindexVectorMetadata(env: Bindings, after: string) {
  const titleIds = await selectEmbeddedAfter(env, after, REINDEX_BATCH);
  const cursor = titleIds.at(-1);

  if (!cursor) {
    return null;
  }

  const titles = await readItems(env.DB, titleIds, titleIds.length);
  const stored = await readVectors(env, titleIds);
  const pending = titles.flatMap((title) => {
    const values = stored.get(title.id);

    return values ? [{ id: title.id, values, metadata: titleVectorMetadata(title) }] : [];
  });

  if (pending.length > 0) {
    await env.VECTORS.upsert(pending);
  }

  logEvent("vector_metadata_reindexed", { count: pending.length, cursor });

  return cursor;
}

export async function selectUnembedded(env: Bindings, limit: number) {
  const rows = await env.DB.query<{ titleId: string }>(
    `SELECT t.id AS "titleId"
     FROM catalog_titles AS t
     LEFT JOIN title_embeddings AS e ON e.title_id = t.id AND e.model = $1
     WHERE ${OUTSTANDING} AND ${OFF_BACKOFF}
     ORDER BY COALESCE(e.attempts, 0), t.popularity DESC
     LIMIT $2`,
    [EMBEDDING_MODEL, clamp(limit, 1, 5_000)],
  );

  return rows.rows.map((row) => row.titleId);
}

export type EmbeddingCoverage = {
  model: string;
  titles: number;
  embedded: number;
  outstanding: number;
  retrying: number;
  otherModels: number;
  newest: string | null;
};

export async function readEmbeddingCoverage(env: Bindings): Promise<EmbeddingCoverage> {
  const row = await env.DB.first<Omit<EmbeddingCoverage, "model">>(
    `SELECT
       (SELECT count(*) FROM catalog_titles) AS titles,
       (SELECT count(*) FROM title_embeddings WHERE model = $1 AND content_hash IS NOT NULL)
         AS embedded,
       (SELECT count(*) FROM title_embeddings WHERE model <> $1) AS "otherModels",
       (SELECT count(*) FROM title_embeddings
         WHERE model = $1 AND content_hash IS NULL AND attempts > 0) AS retrying,
       (SELECT max(embedded_at) FROM title_embeddings WHERE model = $1 AND content_hash IS NOT NULL)
         AS newest,
       (SELECT count(*)
          FROM catalog_titles AS t
          LEFT JOIN title_embeddings AS e ON e.title_id = t.id AND e.model = $1
         WHERE ${OUTSTANDING}) AS outstanding`,
    [EMBEDDING_MODEL],
  );

  return {
    model: EMBEDDING_MODEL,
    titles: row?.titles ?? 0,
    embedded: row?.embedded ?? 0,
    outstanding: row?.outstanding ?? 0,
    retrying: row?.retrying ?? 0,
    otherModels: row?.otherModels ?? 0,
    newest: row?.newest ?? null,
  };
}

export type Neighbour = { id: string; score: number };

export async function nearestTo(env: Bindings, vector: number[], search: CatalogueSearch) {
  const matches = await queryTitleVectors(env, vector, search);

  return matches.matches.map((match): Neighbour => ({ id: match.id, score: match.score }));
}

export async function neighboursOf(env: Bindings, titleId: string, topK = 24) {
  try {
    const matches = await env.VECTORS.queryById(titleId, { topK, returnMetadata: "none" });

    return matches.matches
      .filter((match) => match.id !== titleId)
      .map((match): Neighbour => ({ id: match.id, score: match.score }));
  } catch (error) {
    logError("vector_similar_failed", error, { titleId });

    return [];
  }
}

export async function similarTo(env: Bindings, titleId: string, topK = 24) {
  const neighbours = await neighboursOf(env, titleId, topK);

  return neighbours.map((neighbour) => neighbour.id);
}
