import { isRecord, numberAt, records, stringAt } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const SEARCH_CACHE_TTL = 604_800;
const VIEWS_CACHE_TTL = 43_200;

const SEARCH_BASE = "https://en.wikipedia.org/w/api.php";
const METRICS_BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
const USER_AGENT = "Marquee/1.0 (personal streaming discovery; https://marquee.pashi.app)";

export const WikimediaError = upstreamError("WikimediaError");

function stamp(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function normalise(value: string) {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function withoutArticle(value: string) {
  return value.startsWith("the ") ? value.slice(4) : value;
}

export function articleMatchesTitle(article: string, names: (string | null)[]) {
  const subject = withoutArticle(normalise(article.replace(/\s*\([^)]*\)\s*$/u, "")));

  return names.some((name) => {
    const wanted = withoutArticle(normalise(name ?? ""));

    return wanted.length > 0 && wanted === subject;
  });
}

export function articleUrl(article: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replaceAll(" ", "_"))}`;
}

export async function findArticle(names: (string | null)[], year: number | null, isFilm: boolean) {
  const [title] = names;

  if (!title) {
    return null;
  }

  const url = new URL(SEARCH_BASE);

  url.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${title} ${year ?? ""} ${isFilm ? "film" : "television series"}`.trim(),
    srlimit: "5",
    format: "json",
    origin: "*",
  }).toString();

  const response = await upstreamFetch(url, {
    headers: { "user-agent": USER_AGENT },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: SEARCH_CACHE_TTL,
  });

  if (!response.ok) {
    throw new WikimediaError(`Wikipedia search failed (${response.status})`, response.status);
  }

  const payload = await response.json();
  const query = isRecord(payload) && isRecord(payload.query) ? payload.query : null;
  const found = (query ? records(query.search) : []).flatMap((result) => {
    const name = stringAt(result, "title");

    return name ? [name] : [];
  });

  return found.find((name) => articleMatchesTitle(name, names)) ?? null;
}

export async function getPageviews(article: string, days = 14) {
  const end = new Date(Date.now() - 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const url = `${METRICS_BASE}/${encodeURIComponent(article.replaceAll(" ", "_"))}/daily/${stamp(start)}/${stamp(end)}`;
  const response = await upstreamFetch(url, {
    headers: { "user-agent": USER_AGENT },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: VIEWS_CACHE_TTL,
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new WikimediaError(`Pageviews request failed (${response.status})`, response.status);
  }

  const payload = await response.json();

  return records(isRecord(payload) ? payload.items : []).flatMap((item): number[] => {
    const views = numberAt(item, "views");

    return views === null ? [] : [views];
  });
}
