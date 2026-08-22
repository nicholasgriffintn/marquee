import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import { searchCatalogue, type CatalogueSearch } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";
import { buzzBoosts } from "./buzz.ts";
import { embedQuery } from "./embeddings.ts";

const RERANK_MODEL = "@cf/baai/bge-reranker-base";

type RerankInput = { query: string; contexts: { text: string }[]; top_k?: number };

function reranker(env: Bindings) {
  return env.AI as unknown as {
    run(model: typeof RERANK_MODEL, inputs: RerankInput): Promise<unknown>;
  };
}

const VECTOR_TOP_K = 60;
const KEYWORD_CANDIDATES = 30;
const RERANK_CANDIDATES = 48;
const RERANK_TEXT_LENGTH = 400;

export type RetrievalQuery = CatalogueSearch & {
  text?: string;
  boosts?: Map<string, number>;
};

function candidateText(title: MediaTitle) {
  return [
    `${title.title}${title.year ? ` (${title.year})` : ""}`,
    title.mediaType === "movie" ? "Film" : "Television",
    title.genres.join(", "),
    (title.keywords ?? []).slice(0, 12).join(", "),
    title.overview,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, RERANK_TEXT_LENGTH);
}

function parseRanking(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.response)) {
    return [];
  }

  return result.response.flatMap((entry): { index: number; score: number }[] =>
    isRecord(entry) && typeof entry.id === "number" && typeof entry.score === "number"
      ? [{ index: entry.id, score: entry.score }]
      : [],
  );
}

async function vectorCandidates(env: Bindings, query: RetrievalQuery, text: string) {
  const vector = await embedQuery(env, text);

  if (!vector) {
    return [];
  }

  const matches = await env.VECTORS.query(vector, {
    topK: VECTOR_TOP_K,
    returnMetadata: false,
  });
  const ids = matches.matches.map((match) => match.id);

  if (ids.length === 0) {
    return [];
  }

  return searchCatalogue(env.DB, {
    ...query,
    query: undefined,
    sort: "popularity",
    includeIds: ids,
    limit: 60,
  });
}

export async function retrieveTitles(env: Bindings, query: RetrievalQuery) {
  const limit = Math.max(1, Math.min(40, query.limit ?? 12));
  const text = query.text?.trim() || query.query?.trim() || "";
  const keywordSearch: CatalogueSearch = {
    ...query,
    query: query.query ?? query.text,
    limit: KEYWORD_CANDIDATES,
  };

  if (!text) {
    return searchCatalogue(env.DB, { ...query, limit });
  }

  const [keywordResult, vectorResult] = await Promise.allSettled([
    searchCatalogue(env.DB, keywordSearch),
    vectorCandidates(env, query, text),
  ]);

  if (keywordResult.status === "rejected") {
    logError("keyword_retrieval_failed", keywordResult.reason);
  }

  if (vectorResult.status === "rejected") {
    logError("vector_retrieval_failed", vectorResult.reason);
  }

  const keyword = keywordResult.status === "fulfilled" ? keywordResult.value : [];
  const semantic = vectorResult.status === "fulfilled" ? vectorResult.value : [];
  const merged = new Map<string, MediaTitle>();

  for (let index = 0; index < Math.max(keyword.length, semantic.length); index += 1) {
    for (const title of [keyword[index], semantic[index]]) {
      if (title && !merged.has(title.id)) {
        merged.set(title.id, title);
      }
    }
  }

  const candidates = [...merged.values()].slice(0, RERANK_CANDIDATES);

  if (candidates.length <= limit) {
    return candidates;
  }

  return rank(env, text, candidates, limit, query.boosts);
}

async function rank(
  env: Bindings,
  text: string,
  candidates: MediaTitle[],
  limit: number,
  boosts?: Map<string, number>,
) {
  const buzz = await buzzBoosts(
    env,
    candidates.map((title) => title.id),
  ).catch(() => new Map<string, number>());

  try {
    const result = await reranker(env).run(RERANK_MODEL, {
      query: text.slice(0, 512),
      contexts: candidates.map((title) => ({ text: candidateText(title) })),
      top_k: candidates.length,
    });
    const ranking = parseRanking(result);

    if (ranking.length === 0) {
      return candidates.slice(0, limit);
    }

    const scored = ranking.flatMap((entry) => {
      const title = candidates[entry.index];

      return title
        ? [
            {
              title,
              score: entry.score + (boosts?.get(title.id) ?? 0) + (buzz.get(title.id) ?? 0),
            },
          ]
        : [];
    });

    scored.sort((left, right) => right.score - left.score);

    return scored.slice(0, limit).map((entry) => entry.title);
  } catch (error) {
    logError("rerank_failed", error);

    return candidates.slice(0, limit);
  }
}
