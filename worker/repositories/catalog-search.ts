import type { MediaTitle } from "../../src/domain/catalog.ts";
import { parseStoredTitle } from "../lib/catalog-payload.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";

type PayloadRow = { payload: string; posterKey?: string | null };

export type CatalogueSort = "popularity" | "score" | "recent" | "relevance";

const VOTE_PRIOR = 250;
const MEAN_SCORE = 6.5;
const SCORE_SORT_MIN_VOTES = 50;
const MAX_QUERY_TOKENS = 8;

const WEIGHTED_RATING = `(
  (COALESCE(json_extract(t.payload, '$.tmdbVoteCount'), 0) * COALESCE(json_extract(t.payload, '$.tmdbScore'), 0))
  + (${VOTE_PRIOR} * ${MEAN_SCORE})
) / (COALESCE(json_extract(t.payload, '$.tmdbVoteCount'), 0) + ${VOTE_PRIOR})`;

const RELEVANCE = `bm25(catalog_search, 12.0, 8.0, 1.0, 4.0, 3.0, 0.0)`;

export type CatalogueSearch = {
  query?: string;
  minVotes?: number;
  genres?: string[];
  keywords?: string[];
  mediaType?: "movie" | "tv";
  providerIds?: string[];
  minScore?: number;
  releasedAfter?: number;
  excludeIds?: string[];
  includeIds?: string[];
  sort?: CatalogueSort;
  limit?: number;
  offset?: number;
};

const ORDER_BY: Record<CatalogueSort, string> = {
  popularity: "t.popularity DESC",
  score: `${WEIGHTED_RATING} DESC, t.popularity DESC`,
  recent: "COALESCE(t.year, 0) DESC, t.popularity DESC",
  relevance: `${RELEVANCE}, t.popularity DESC`,
};

export function ftsMatchQuery(raw: string) {
  const tokens = raw
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, MAX_QUERY_TOKENS);

  return tokens.length ? tokens.map((token) => `"${token}"*`).join(" AND ") : null;
}

function hydrate(rows: PayloadRow[]): MediaTitle[] {
  return rows.flatMap((row) => {
    const title = parseStoredTitle(row.payload);

    return title
      ? [row.posterKey ? { ...title, posterUrl: `/media/${row.posterKey}` } : title]
      : [];
  });
}

export async function searchCatalogue(db: D1Database, search: CatalogueSearch) {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const match = search.query?.trim() ? ftsMatchQuery(search.query.trim().slice(0, 120)) : null;
  const genres = (search.genres ?? [])
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  const providerIds = validProviderIds(search.providerIds);
  const excludedIds = [...new Set((search.excludeIds ?? []).filter(isKnownTitle))].slice(0, 300);
  const limit = Math.max(1, Math.min(60, Math.floor(search.limit ?? 12)));
  const offset = Math.max(0, Math.min(2_000, Math.floor(search.offset ?? 0)));
  const sort = search.sort ?? (match ? "relevance" : "popularity");
  const orderBy = ORDER_BY[match ? sort : sort === "relevance" ? "popularity" : sort];

  if (match) {
    conditions.push("catalog_search MATCH ?");
    bindings.push(match);
  }

  if (search.mediaType === "movie" || search.mediaType === "tv") {
    conditions.push("t.media_type = ?");
    bindings.push(search.mediaType);
  }

  if (genres.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM json_each(t.payload, '$.genres')
         WHERE lower(json_each.value) IN (${genres.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...genres);
  }

  const keywords = (search.keywords ?? [])
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

  if (keywords.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM json_each(t.payload, '$.keywords')
         WHERE lower(json_each.value) IN (${keywords.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...keywords);
  }

  if (providerIds.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM json_each(t.provider_ids)
         WHERE json_each.value IN (${providerIds.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...providerIds);
  }

  if (Number.isFinite(search.minScore)) {
    conditions.push("COALESCE(json_extract(t.payload, '$.tmdbScore'), 0) >= ?");
    bindings.push(Math.max(0, Math.min(10, search.minScore ?? 0)));
  }

  const minVotes = Number.isFinite(search.minVotes)
    ? Math.max(0, Math.trunc(search.minVotes ?? 0))
    : sort === "score" || Number.isFinite(search.minScore)
      ? SCORE_SORT_MIN_VOTES
      : 0;

  if (minVotes > 0) {
    conditions.push("COALESCE(json_extract(t.payload, '$.tmdbVoteCount'), 0) >= ?");
    bindings.push(minVotes);
  }

  if (Number.isFinite(search.releasedAfter)) {
    conditions.push("COALESCE(t.year, 0) >= ?");
    bindings.push(Math.max(1900, Math.min(2100, Math.trunc(search.releasedAfter ?? 0))));
  }

  if (excludedIds.length) {
    conditions.push(`t.id NOT IN (${excludedIds.map(() => "?").join(", ")})`);
    bindings.push(...excludedIds);
  }

  if (search.includeIds) {
    const includedIds = [...new Set(search.includeIds.filter(isKnownTitle))].slice(0, 200);

    if (includedIds.length === 0) {
      return [];
    }

    conditions.push(`t.id IN (${includedIds.map(() => "?").join(", ")})`);
    bindings.push(...includedIds);
  }

  const from = match
    ? "catalog_search JOIN catalog_titles AS t ON t.rowid = catalog_search.rowid"
    : "catalog_titles AS t";
  const rows = await db
    .prepare(
      `SELECT t.payload, t.poster_key AS posterKey
       FROM ${from}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, limit, offset)
    .all<PayloadRow>();

  return hydrate(rows.results);
}

export async function readRanked(db: D1Database, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, 100);

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT id, payload, poster_key AS posterKey
       FROM catalog_titles
       WHERE id IN (${uniqueIds.map(() => "?").join(", ")})`,
    )
    .bind(...uniqueIds)
    .all<PayloadRow & { id: string }>();
  const byId = new Map(hydrate(rows.results).map((title) => [title.id, title]));

  return uniqueIds.flatMap((id) => {
    const title = byId.get(id);

    return title ? [title] : [];
  });
}

export async function readGenres(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT json_each.value AS genre, count(*) AS titles
       FROM catalog_titles, json_each(payload, '$.genres')
       GROUP BY json_each.value
       HAVING titles >= 5
       ORDER BY titles DESC`,
    )
    .all<{ genre: string; titles: number }>();

  return rows.results
    .filter((row) => typeof row.genre === "string" && row.genre.length > 0)
    .map((row) => row.genre);
}

export async function readKeywords(db: D1Database, limit = 120) {
  const rows = await db
    .prepare(
      `SELECT json_each.value AS keyword, count(*) AS titles
       FROM catalog_titles, json_each(payload, '$.keywords')
       GROUP BY json_each.value
       HAVING titles >= 8
       ORDER BY titles DESC
       LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(400, limit)))
    .all<{ keyword: string; titles: number }>();

  return rows.results
    .filter((row) => typeof row.keyword === "string" && row.keyword.length > 0)
    .map((row) => row.keyword);
}
