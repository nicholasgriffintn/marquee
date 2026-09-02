import type { MediaTitle } from "../../../src/domain/catalog.ts";
import { cachedWorkersAiOptions } from "../../ai/workers-ai.ts";
import { withDeadline } from "../../lib/deadline.ts";
import { logError } from "../../lib/logging.ts";
import { normaliseQueryText } from "../../lib/text.ts";
import { isRecord } from "../../lib/values.ts";
import type { Bindings } from "../../types.ts";

const RERANK_MODEL = "@cf/baai/bge-reranker-base";
const RERANK_TEXT_LENGTH = 400;
const RERANK_QUERY_LENGTH = 512;
const RERANK_TIMEOUT_MS = 1_200;

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

async function rerankOptions(env: Bindings, query: string, ids: string[]): Promise<AiOptions> {
  return {
    ...(await cachedWorkersAiOptions(
      env,
      "rerank",
      RERANK_MODEL,
      null,
      `${query}:${ids.join(",")}`,
    )),
    signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
  };
}

export type Ranking = { ids: string[]; scores: Map<string, number> };

export async function rerankTitles(
  env: Bindings,
  text: string,
  candidates: MediaTitle[],
): Promise<Ranking> {
  const ids: string[] = [];
  const scores = new Map<string, number>();
  const ordered = candidates.toSorted((left, right) => left.id.localeCompare(right.id));

  try {
    const query = normaliseQueryText(text).slice(0, RERANK_QUERY_LENGTH);
    const input = {
      query,
      contexts: ordered.map((title) => ({ text: candidateText(title) })),
      top_k: ordered.length,
    };
    const result = await withDeadline<unknown>(
      env.AI.run(
        RERANK_MODEL,
        input,
        await rerankOptions(
          env,
          query,
          ordered.map((title) => title.id),
        ),
      ),
      RERANK_TIMEOUT_MS,
      null,
    );

    for (const entry of parseRanking(result).toSorted((left, right) => right.score - left.score)) {
      const title = ordered[entry.index];

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
