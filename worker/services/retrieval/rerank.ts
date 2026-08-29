import type { MediaTitle } from "../../../src/domain/catalog.ts";
import { logError } from "../../lib/logging.ts";
import { isRecord } from "../../lib/values.ts";
import type { Bindings } from "../../types.ts";

const RERANK_MODEL = "@cf/baai/bge-reranker-base";
const RERANK_TEXT_LENGTH = 400;
const RERANK_QUERY_LENGTH = 512;

type RerankInput = { query: string; contexts: { text: string }[]; top_k?: number };

function reranker(env: Bindings) {
  return env.AI as unknown as {
    run(model: typeof RERANK_MODEL, inputs: RerankInput): Promise<unknown>;
  };
}

function candidateText(title: MediaTitle) {
  return [
    `${title.title}${title.year ? ` (${title.year})` : ""}`,
    title.mediaType === "movie" ? "Film" : "Television",
    title.genres.join(", "),
    (title.keywords ?? []).slice(0, 12).join(", "),
    (title.studios ?? []).join(", "),
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

export async function rerankTitles(env: Bindings, text: string, candidates: MediaTitle[]) {
  const ids: string[] = [];
  const scores = new Map<string, number>();

  try {
    const result = await reranker(env).run(RERANK_MODEL, {
      query: text.slice(0, RERANK_QUERY_LENGTH),
      contexts: candidates.map((title) => ({ text: candidateText(title) })),
      top_k: candidates.length,
    });

    for (const entry of parseRanking(result).toSorted((left, right) => right.score - left.score)) {
      const title = candidates[entry.index];

      if (title && !scores.has(title.id)) {
        ids.push(title.id);
        scores.set(title.id, entry.score);
      }
    }
  } catch (error) {
    logError("rerank_failed", error);
  }

  return { ids, scores };
}
