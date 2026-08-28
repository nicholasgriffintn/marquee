import { isRecord, records, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

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

export async function queryWikidata(query: string, options: QueryOptions) {
  const url = new URL(SPARQL_ENDPOINT);

  url.search = new URLSearchParams({ query, format: "json" }).toString();

  const response = await upstreamFetch(url, {
    headers: { accept: "application/sparql-results+json", "user-agent": UPSTREAM_AGENT },
    timeoutMs: options.timeoutMs,
    cacheTtl: options.cacheTtl,
  });

  if (!response.ok) {
    throw new WikidataError(`Wikidata query failed (${response.status})`, response.status);
  }

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
