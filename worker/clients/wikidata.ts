import type { MediaType } from "../../src/domain/catalog.ts";
import { isRecord, records, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH = 80;

const TMDB_PROPERTY: Record<MediaType, string> = { movie: "P4947", tv: "P4983" };

export const WikidataError = upstreamError("WikidataError");

export type EntityRef = { titleId: string; mediaType: MediaType; tmdbId: number };

export type TitleEntity = { entityId: string; article: string | null };

function articleTitle(url: string) {
  const match = /\/wiki\/(.+)$/u.exec(url);

  return match ? decodeURIComponent(match[1]).replaceAll("_", " ") : null;
}

function entityId(url: string) {
  const match = /\/(Q\d+)$/u.exec(url);

  return match ? match[1] : null;
}

function refKey(ref: EntityRef) {
  return `${ref.mediaType}:${ref.tmdbId}`;
}

function branch(mediaType: MediaType, refs: EntityRef[]) {
  const variable = mediaType === "movie" ? "movie" : "show";
  const values = refs.map((ref) => `"${ref.tmdbId}"`).join(" ");

  return `{
    VALUES ?${variable} { ${values} }
    ?item wdt:${TMDB_PROPERTY[mediaType]} ?${variable} .
    BIND(CONCAT("${mediaType}:", ?${variable}) AS ?key)
  }`;
}

async function queryBatch(refs: EntityRef[]) {
  const byType = new Map<MediaType, EntityRef[]>();

  for (const ref of refs) {
    byType.set(ref.mediaType, [...(byType.get(ref.mediaType) ?? []), ref]);
  }

  const branches = [...byType].map(([mediaType, group]) => branch(mediaType, group));
  const query = `SELECT ?key ?item ?article WHERE {
  ${branches.join("\n  UNION\n  ")}
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
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
  const titleIds = new Map(refs.map((ref) => [refKey(ref), ref.titleId]));
  const matched = new Map<string, TitleEntity>();

  for (const binding of records(bindings)) {
    const key = isRecord(binding.key) ? stringAt(binding.key, "value") : null;
    const item = isRecord(binding.item) ? stringAt(binding.item, "value") : null;
    const titleId = key ? titleIds.get(key) : null;
    const entity = item ? entityId(item) : null;

    if (!titleId || !entity) {
      continue;
    }

    const found = isRecord(binding.article) ? stringAt(binding.article, "value") : null;
    const article = found ? articleTitle(found) : null;
    const seen = matched.get(titleId);

    if (!seen || (!seen.article && article)) {
      matched.set(titleId, { entityId: entity, article });
    }
  }

  return matched;
}

export async function resolveEntities(refs: EntityRef[]) {
  const unique = new Map(
    refs
      .filter((ref) => Number.isInteger(ref.tmdbId) && ref.tmdbId > 0)
      .map((ref) => [ref.titleId, ref]),
  );
  const usable = [...unique.values()];
  const matched = new Map<string, TitleEntity>();

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryBatch(usable.slice(index, index + BATCH));

    for (const [titleId, entity] of wave) {
      matched.set(titleId, entity);
    }
  }

  return matched;
}
