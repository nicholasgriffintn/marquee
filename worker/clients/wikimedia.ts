import { isRecord, numberAt, records, stringAt } from "../lib/values.ts";

const SEARCH_BASE = "https://en.wikipedia.org/w/api.php";
const METRICS_BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
const USER_AGENT = "Marquee/1.0 (personal streaming discovery; https://marquee.pashi.app)";

export class WikimediaError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "WikimediaError";
  }
}

function stamp(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export async function findArticle(title: string, year: number | null, isFilm: boolean) {
  const url = new URL(SEARCH_BASE);

  url.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${title} ${year ?? ""} ${isFilm ? "film" : "television series"}`.trim(),
    srlimit: "1",
    format: "json",
    origin: "*",
  }).toString();

  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
    cf: { cacheEverything: true, cacheTtl: 604_800 },
  });

  if (!response.ok) {
    throw new WikimediaError(`Wikipedia search failed (${response.status})`, response.status);
  }

  const payload = await response.json();
  const query = isRecord(payload) && isRecord(payload.query) ? payload.query : null;
  const [first] = query ? records(query.search) : [];

  return first ? stringAt(first, "title") : null;
}

export async function getPageviews(article: string, days = 14) {
  const end = new Date(Date.now() - 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const url = `${METRICS_BASE}/${encodeURIComponent(article.replaceAll(" ", "_"))}/daily/${stamp(start)}/${stamp(end)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
    cf: { cacheEverything: true, cacheTtl: 43_200 },
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
