import { isRecord, records, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH = 60;

export const WikidataError = upstreamError("WikidataError");

function articleTitle(url: string) {
  const match = /\/wiki\/(.+)$/u.exec(url);

  return match ? decodeURIComponent(match[1]).replaceAll("_", " ") : null;
}

async function queryBatch(imdbIds: string[]) {
  const values = imdbIds.map((id) => `"${id}"`).join(" ");
  const query = `SELECT ?imdb ?article WHERE {
  VALUES ?imdb { ${values} }
  ?item wdt:P345 ?imdb .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}`;
  const url = new URL(SPARQL_ENDPOINT);

  url.search = new URLSearchParams({ query, format: "json" }).toString();

  const response = await upstreamFetch(url, {
    headers: { accept: "application/sparql-results+json", "user-agent": UPSTREAM_AGENT },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });

  if (!response.ok) {
    throw new WikidataError(`Wikidata query failed (${response.status})`, response.status);
  }

  const payload = await response.json();
  const bindings = isRecord(payload) && isRecord(payload.results) ? payload.results.bindings : [];
  const matched = new Map<string, string>();

  for (const binding of records(bindings)) {
    const imdb = isRecord(binding.imdb) ? stringAt(binding.imdb, "value") : null;
    const article = isRecord(binding.article) ? stringAt(binding.article, "value") : null;
    const title = article ? articleTitle(article) : null;

    if (imdb && title && !matched.has(imdb)) {
      matched.set(imdb, title);
    }
  }

  return matched;
}

export async function articlesForImdbIds(imdbIds: string[]) {
  const unique = [...new Set(imdbIds.filter((id) => /^tt\d+$/u.test(id)))];
  const matched = new Map<string, string>();

  for (let index = 0; index < unique.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryBatch(unique.slice(index, index + BATCH));

    for (const [imdb, article] of wave) {
      matched.set(imdb, article);
    }
  }

  return matched;
}
