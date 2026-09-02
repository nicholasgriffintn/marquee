import { tidySynopsis } from "../lib/revival-text.ts";
import { stripMarkup } from "../lib/text.ts";
import { isRecord, recordAt, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";
import { articleUrl } from "./wikimedia.ts";

const SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary";
const TIMEOUT_MS = 12_000;
const CACHE_TTL = 604_800;
const MAX_EXTRACT = 1_200;

export const WikipediaError = upstreamError("WikipediaError");

export type ArticleSummary = { article: string; articleUrl: string; extract: string };

export async function readArticleSummary(article: string): Promise<ArticleSummary | null> {
  const path = encodeURIComponent(article.replaceAll(" ", "_"));
  const response = await upstreamFetch(`${SUMMARY_BASE}/${path}`, {
    headers: { "user-agent": UPSTREAM_AGENT },
    source: "wikipedia",
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new WikipediaError(`Wikipedia summary failed (${response.status})`, response.status);
  }

  const payload = await response.json();

  if (!isRecord(payload) || payload.type === "disambiguation") {
    return null;
  }

  const lede = stripMarkup(stringAt(payload, "extract") ?? "");
  const extract = tidySynopsis(lede).slice(0, MAX_EXTRACT);
  const canonical = stringAt(recordAt(payload, "titles") ?? {}, "normalized") ?? article;

  if (!extract) {
    return null;
  }

  return { article: canonical, articleUrl: articleUrl(canonical), extract };
}
