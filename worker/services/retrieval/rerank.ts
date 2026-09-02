import type { MediaTitle } from "../../../src/domain/catalog.ts";
import { withDeadline } from "../../lib/deadline.ts";
import { sha256Hex } from "../../lib/hash.ts";
import { logError } from "../../lib/logging.ts";
import { normaliseQueryText } from "../../lib/text.ts";
import { isRecord } from "../../lib/values.ts";
import type { Bindings } from "../../types.ts";

const RERANK_MODEL = "@cf/baai/bge-reranker-base";
const RERANK_TEXT_LENGTH = 400;
const RERANK_QUERY_LENGTH = 512;
const RERANK_TIMEOUT_MS = 1_200;
const CACHE_SECONDS = 86_400;

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
  const key = await sha256Hex(`${RERANK_MODEL}:${query}:${ids.join(",")}`);

  return {
    signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    gateway: {
      id: env.AI_GATEWAY_ID,
      skipCache: false,
      cacheTtl: CACHE_SECONDS,
      cacheKey: `marquee-worker-v1-${key}`,
      collectLog: true,
      metadata: { feature: "rerank" },
    },
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
