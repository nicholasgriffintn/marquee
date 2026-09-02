import { isRecord, records, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 8_000;
const COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_WAIT_MS = 5_000;

let coolingUntil = 0;

export const WikidataError = upstreamError("WikidataError");

export type SparqlRow = Record<string, string>;

export type QueryOptions = { timeoutMs: number; cacheTtl: number };

export function literals(values: (string | number)[]) {
  return values
    .map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
    .join(" ");
}

export function entityIdFrom(url: string | undefined) {
  const match = url ? /\/(Q\d+)$/u.exec(url) : null;

  return match ? match[1] : null;
}

export function articleTitleFrom(url: string | undefined) {
  const match = url ? /\/wiki\/(.+)$/u.exec(url) : null;

  return match ? decodeURIComponent(match[1]).replaceAll("_", " ") : null;
}

export function yearFrom(value: string | undefined) {
  const match = value ? /^-?(\d{4})/u.exec(value) : null;

  return match ? Number(match[1]) : null;
}

function backoffFor(attempt: number, retryAfter: string | null) {
  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, MAX_BACKOFF_MS);
  }

  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

async function fetchQuery(url: URL, options: QueryOptions) {
  let last: InstanceType<typeof WikidataError> | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const response = await upstreamFetch(url, {
      headers: { accept: "application/sparql-results+json", "user-agent": UPSTREAM_AGENT },
      source: "wikidata",
      timeoutMs: options.timeoutMs,
      cacheTtl: options.cacheTtl,
    });

    if (response.ok) {
      return response;
    }

    last = new WikidataError(`Wikidata query failed (${response.status})`, response.status);

    if (!RETRY_STATUSES.has(response.status)) {
      throw last;
    }

    if (response.status === 429) {
      coolingUntil = Date.now() + COOLDOWN_MS;
    }

    const retryAfter = response.headers.get("retry-after");

    if (attempt < MAX_ATTEMPTS - 1) {
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, backoffFor(attempt, retryAfter)));
    }
  }

  throw last ?? new WikidataError("Wikidata query failed", 502);
}

export async function queryWikidata(query: string, options: QueryOptions) {
  const cooling = coolingUntil - Date.now();

  if (cooling > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(cooling, MAX_COOLDOWN_WAIT_MS)));
  }

  const url = new URL(SPARQL_ENDPOINT);

  url.search = new URLSearchParams({ query, format: "json" }).toString();

  const response = await fetchQuery(url, options);
  const payload = await response.json();
  const bindings = isRecord(payload) && isRecord(payload.results) ? payload.results.bindings : [];

  return records(bindings).map((binding) => {
    const row: SparqlRow = {};

    for (const [name, cell] of Object.entries(binding)) {
      const value = isRecord(cell) ? stringAt(cell, "value") : null;

      if (value !== null) {
        row[name] = value;
      }
    }

    return row;
  });
}
