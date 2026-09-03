import { FULL_ACCESS } from "../../src/domain/access.ts";
import type { MediaTitle } from "../../src/domain/catalog.ts";
import { cachedWorkersAiOptions } from "../ai/workers-ai.ts";
import { withDeadline } from "../lib/deadline.ts";
import { sha256Hex } from "../lib/hash.ts";
import { errorMessage, logError, logEvent } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { normaliseQueryText } from "../lib/text.ts";
import { isRecord, vectorValues } from "../lib/values.ts";
import { rowPlaceholders } from "../repositories/catalog-array-utils.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { CatalogueSearch } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";
import {
  NO_MATCHES,
  queryTitleVectors,
  titleVectorMetadata,
  VECTOR_QUERY_TIMEOUT_MS,
  type VectorQueryOptions,
} from "./vector-index.ts";

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

async function embedTexts(env: Bindings, texts: string[], timeoutMs?: number) {
  if (texts.length === 0) {
    return [];
  }

  const input = {
    text: texts.map((text) => text.slice(0, MAX_TEXT_LENGTH)),
    truncate_inputs: true,
  };
  const options = await cachedWorkersAiOptions(env, "embedding", EMBEDDING_MODEL, input);
  const result = await env.AI.run(
    EMBEDDING_MODEL,
    input,
    timeoutMs === undefined ? options : { ...options, signal: AbortSignal.timeout(timeoutMs) },
  );

  return parseVectors(result);
}

const QUERY_EMBED_TIMEOUT_MS = 1_500;

export async function embedQuery(env: Bindings, text: string) {
  const normalised = normaliseQueryText(text);

  if (!normalised) {
    return null;
  }

  const [vector] = await withDeadline<number[][]>(
    embedTexts(env, [normalised], QUERY_EMBED_TIMEOUT_MS),
    QUERY_EMBED_TIMEOUT_MS,
    [],
  );

  return vector ?? null;
}

const RETRY_MINUTES = 30;
const MAX_RETRY_MINUTES = 24 * 60;
const MAX_ERROR_LENGTH = 200;

async function markEmbedded(db: Database, titles: MediaTitle[], hashById: Map<string, string>) {
  const rows = titles.flatMap((title) => {
    const hash = hashById.get(title.id);

    return hash === undefined ? [] : [[title.id, EMBEDDING_MODEL, hash]];
  });

  if (rows.length === 0) {
    return;
  }

  await db.execute(
    `INSERT INTO title_embeddings (title_id, model, content_hash)
     VALUES ${rowPlaceholders(rows.length, 3)}
     ON CONFLICT(title_id) DO UPDATE SET
       model = excluded.model,
       content_hash = excluded.content_hash,
       embedded_at = CURRENT_TIMESTAMP,
       attempts = 0,
       next_attempt_at = NULL,
       error = NULL`,
    rows.flat(),
  );
}

function failurePlaceholders(rows: number) {
  return Array.from(
    { length: rows },
    (_unusedRow, row) =>
      `($${row * 3 + 1}, $${row * 3 + 2}, NULL, 1,` +
      ` (CURRENT_TIMESTAMP + INTERVAL '${RETRY_MINUTES} minute'), $${row * 3 + 3})`,
  ).join(", ");
}

// A failed title keeps a marker so the next selection can step over it instead of
// re-reading the same head of the popularity queue on every sweep.
async function recordFailures(env: Bindings, titles: MediaTitle[], reason: string) {
  if (titles.length === 0) {
    return;
  }

  await env.DB.execute(
    `INSERT INTO title_embeddings
       (title_id, model, content_hash, attempts, next_attempt_at, error)
     VALUES ${failurePlaceholders(titles.length)}
     ON CONFLICT(title_id) DO UPDATE SET
       model = excluded.model,
       content_hash = NULL,
       attempts = title_embeddings.attempts + 1,
       next_attempt_at = CURRENT_TIMESTAMP
         + LEAST(${MAX_RETRY_MINUTES}, ${RETRY_MINUTES} * (title_embeddings.attempts + 1))
           * INTERVAL '1 minute',
       error = excluded.error`,
    titles.flatMap((title) => [title.id, EMBEDDING_MODEL, reason.slice(0, MAX_ERROR_LENGTH)]),
  );
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
  const titles = await readItems(env.DB, titleIds, FULL_ACCESS, titleIds.length);

  if (titles.length === 0) {
    return 0;
  }

  const hashById = new Map(
    await Promise.all(
      titles.map(async (title): Promise<[string, string]> => [
        title.id,
        await contentHash(embeddingText(title)),
      ]),
    ),
  );
  const known = await storedHashes(
    env,
    titles.map((title) => title.id),
  );
  const stale = (title: MediaTitle) =>
    options.force === true || known.get(title.id) !== hashById.get(title.id);
  const pending = titles.filter(stale);
  const unchanged = titles.filter((title) => !stale(title));
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
      await markEmbedded(env.DB, wave, hashById);

      stored += wave.length;
    } catch (error) {
      logError("embedding_wave_failed", error, { titles: wave.length });
      failed += wave.length;
      // oxlint-disable-next-line no-await-in-loop
      await recordFailures(env, wave, errorMessage(error, 200));
    }
  }

  await markEmbedded(env.DB, unchanged, hashById);

  logEvent("titles_embedded", { count: stored, skipped: unchanged.length, failed });

  // The backoff marker keeps the next selection moving; the throw keeps the run log and the
  // queue's own retry honest about the failure.
  if (failed > 0) {
    throw new Error(`${failed} of ${pending.length} titles could not be embedded`);
  }

  return stored;
}

const VECTOR_READ_BATCH = 20;

export async function readVectors(
  env: Bindings,
  titleIds: string[],
  timeoutMs: number | null = VECTOR_QUERY_TIMEOUT_MS,
) {
  const unique = [...new Set(titleIds)];
  const waves: string[][] = [];

  for (let index = 0; index < unique.length; index += VECTOR_READ_BATCH) {
    waves.push(unique.slice(index, index + VECTOR_READ_BATCH));
  }

  const results = await Promise.all(
    waves.map((wave) =>
      timeoutMs === null
        ? env.VECTORS.getByIds(wave)
        : withDeadline<VectorizeVector[]>(env.VECTORS.getByIds(wave), timeoutMs, []),
    ),
  );
  const byId = new Map<string, number[]>();

  for (const vector of results.flat()) {
    const values = vectorValues(vector.values);

    if (values) {
      byId.set(vector.id, values);
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

  const titles = await readItems(env.DB, titleIds, FULL_ACCESS, titleIds.length);
  const stored = await readVectors(env, titleIds, null);
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

export type NeighbourMatches = { neighbours: Neighbour[]; filtered: boolean };

export async function nearestMatches(
  env: Bindings,
  vector: number[],
  search: CatalogueSearch,
  options: VectorQueryOptions = {},
): Promise<NeighbourMatches> {
  const { matches, filtered } = await queryTitleVectors(env, vector, search, options);

  return {
    neighbours: matches.map((match): Neighbour => ({ id: match.id, score: match.score })),
    filtered,
  };
}

export async function nearestTo(env: Bindings, vector: number[], search: CatalogueSearch) {
  const { neighbours } = await nearestMatches(env, vector, search);

  return neighbours;
}

export async function neighboursOf(env: Bindings, titleId: string, topK = 24) {
  try {
    const matches = await withDeadline(
      env.VECTORS.queryById(titleId, { topK, returnMetadata: "none" }),
      VECTOR_QUERY_TIMEOUT_MS,
      NO_MATCHES,
    );

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
