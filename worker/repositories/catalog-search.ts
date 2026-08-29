import type { MediaTitle } from "../../src/domain/catalog.ts";
import { searchTokens } from "../../src/domain/search-query.ts";
import { buzzScoreSql, MIN_TRENDING_VIEWS } from "../lib/buzz.ts";
import {
  CATALOG_TITLE_COLUMNS,
  catalogTitleColumns,
  type CatalogTitleRow,
  withStoredPoster,
} from "../lib/catalog-payload.ts";
import { clamp } from "../lib/numbers.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { hydrateTitleRows } from "./catalog-arrays.ts";

export type CatalogueSort = "trending" | "popularity" | "score" | "recent" | "relevance";

export type SearchScope = "title" | "everything";

const SCORE_SORT_MIN_VOTES = 50;
const MAX_QUERY_TOKENS = 8;
const INCLUDE_ID_LIMIT = 500;
const EXCLUDE_ID_LIMIT = 2_000;

const WEIGHTED_RATING = "t.weighted_rating";
const BLENDED_RATING = "t.blended_rating";

const BUZZ_SCORE = buzzScoreSql("t.id");

const RELEVANCE = `bm25(catalog_search, 12.0, 8.0, 1.0, 4.0, 3.0, 0.0)`;

export type CatalogueSearch = {
  query?: string;
  minVotes?: number;
  genres?: string[];
  keywords?: string[];
  places?: string[];
  mediaType?: "movie" | "tv";
  providerIds?: string[];
  allowUnknownProviders?: boolean;
  minScore?: number;
  releasedAfter?: number;
  maxRuntime?: number;
  excludeIds?: string[];
  includeIds?: string[];
  sort?: CatalogueSort;
  scope?: SearchScope;
  matchAny?: boolean;
  limit?: number;
  offset?: number;
};

export type Eligibility = { conditions: string[]; bindings: unknown[]; impossible: boolean };

const TITLE_EXACTNESS = `(CASE WHEN lower(t.title) = ? OR lower(t.original_title) = ? THEN 0 ELSE 1 END)`;

const ORDER_BY: Record<CatalogueSort, string> = {
  trending: `${BUZZ_SCORE} DESC, t.popularity DESC`,
  popularity: "t.popularity DESC",
  score: `${WEIGHTED_RATING} DESC, t.popularity DESC`,
  recent: "COALESCE(t.year, 0) DESC, t.popularity DESC",
  relevance: `${RELEVANCE}, t.popularity DESC`,
};

function ftsMatchQuery(raw: string, scope: SearchScope = "everything", matchAny = false) {
  const tokens = searchTokens(raw).slice(0, MAX_QUERY_TOKENS);

  if (tokens.length === 0) {
    return null;
  }

  const expression = tokens.map((token) => `"${token}"*`).join(matchAny ? " OR " : " AND ");

  return scope === "title" ? `{title original_title} : (${expression})` : expression;
}

function lowered(values: string[] | undefined, limit: number) {
  return (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, limit);
}

function tagCondition(table: string, column: string, values: string[]) {
  return `EXISTS (
         SELECT 1 FROM ${table} AS x
         WHERE x.title_id = t.id AND lower(x.${column}) IN (${values.map(() => "?").join(", ")})
       )`;
}

function placeCondition(places: string[]) {
  return `EXISTS (
         SELECT 1 FROM catalog_title_places AS tp
         JOIN catalog_places AS cp ON cp.entity_id = tp.place_id
         WHERE tp.title_id = t.id AND tp.kind = 'filming'
           AND lower(cp.label) IN (${places.map(() => "?").join(", ")})
       )`;
}

function providerCondition(allowUnknown: boolean) {
  const offered = `EXISTS (
         SELECT 1 FROM catalog_title_providers AS p
         WHERE p.title_id = t.id AND p.provider_id IN (SELECT value FROM json_each(?))
       )`;

  return allowUnknown
    ? `(${offered} OR NOT EXISTS (
         SELECT 1 FROM catalog_title_providers AS q WHERE q.title_id = t.id
       ))`
    : offered;
}

export function eligibilityClause(search: CatalogueSearch): Eligibility {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const genres = lowered(search.genres, 10);
  const places = lowered(search.places, 6);
  const keywords = lowered(search.keywords, 6);
  const providerIds = validProviderIds(search.providerIds);
  const excludedIds = [...new Set((search.excludeIds ?? []).filter(isKnownTitle))].slice(
    0,
    EXCLUDE_ID_LIMIT,
  );

  if (search.mediaType === "movie" || search.mediaType === "tv") {
    conditions.push("t.media_type = ?");
    bindings.push(search.mediaType);
  }

  if (genres.length) {
    conditions.push(tagCondition("catalog_title_genres", "genre", genres));
    bindings.push(...genres);
  }

  if (places.length) {
    conditions.push(placeCondition(places));
    bindings.push(...places);
  }

  if (keywords.length) {
    conditions.push(tagCondition("catalog_title_keywords", "keyword", keywords));
    bindings.push(...keywords);
  }

  if (providerIds.length) {
    conditions.push(providerCondition(search.allowUnknownProviders === true));
    bindings.push(JSON.stringify(providerIds));
  }

  if (Number.isFinite(search.minScore)) {
    conditions.push(`${BLENDED_RATING} >= ?`);
    bindings.push(clamp(search.minScore ?? 0, 0, 10));
  }

  if (Number.isFinite(search.minVotes) && (search.minVotes ?? 0) > 0) {
    conditions.push("t.vote_count >= ?");
    bindings.push(Math.trunc(search.minVotes ?? 0));
  }

  if (Number.isFinite(search.maxRuntime)) {
    conditions.push(`(t.runtime_minutes IS NULL OR t.runtime_minutes <= ?)`);
    bindings.push(clamp(Math.trunc(search.maxRuntime ?? 600), 30, 600));
  }

  if (Number.isFinite(search.releasedAfter)) {
    conditions.push("COALESCE(t.year, 0) >= ?");
    bindings.push(clamp(Math.trunc(search.releasedAfter ?? 0), 1900, 2100));
  }

  if (excludedIds.length) {
    conditions.push(`t.id NOT IN (SELECT value FROM json_each(?))`);
    bindings.push(JSON.stringify(excludedIds));
  }

  if (!search.includeIds) {
    return { conditions, bindings, impossible: false };
  }

  const includedIds = [...new Set(search.includeIds.filter(isKnownTitle))].slice(
    0,
    INCLUDE_ID_LIMIT,
  );

  conditions.push(`t.id IN (SELECT value FROM json_each(?))`);
  bindings.push(JSON.stringify(includedIds));

  return { conditions, bindings, impossible: includedIds.length === 0 };
}

function requiredVotes(search: CatalogueSearch, sort: CatalogueSort) {
  if (Number.isFinite(search.minVotes)) {
    return Math.max(0, Math.trunc(search.minVotes ?? 0));
  }

  return sort === "score" || Number.isFinite(search.minScore) ? SCORE_SORT_MIN_VOTES : 0;
}

async function hydrate(db: D1Database, rows: CatalogTitleRow[]): Promise<MediaTitle[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.map((title, index) => withStoredPoster(title, rows[index]?.poster_key));
}

export async function filterEligibleIds(
  db: D1Database,
  ids: string[],
  search: CatalogueSearch = {},
) {
  const candidateIds = [...new Set(ids.filter(isKnownTitle))].slice(0, INCLUDE_ID_LIMIT);
  const eligibility = eligibilityClause({ ...search, includeIds: candidateIds });

  if (eligibility.impossible) {
    return new Set<string>();
  }

  const rows = await db
    .prepare(`SELECT t.id FROM catalog_titles AS t WHERE ${eligibility.conditions.join(" AND ")}`)
    .bind(...eligibility.bindings)
    .all<{ id: string }>();

  return new Set(rows.results.map((row) => row.id));
}

export async function searchCatalogue(db: D1Database, search: CatalogueSearch) {
  const match = search.query?.trim()
    ? ftsMatchQuery(search.query.trim().slice(0, 120), search.scope, search.matchAny)
    : null;
  const limit = clamp(Math.floor(search.limit ?? 12), 1, 60);
  const offset = clamp(Math.floor(search.offset ?? 0), 0, 2_000);
  const sort = search.sort ?? (match ? "relevance" : "popularity");
  const eligibility = eligibilityClause({ ...search, minVotes: requiredVotes(search, sort) });

  if (eligibility.impossible) {
    return [];
  }

  const orderBindings: unknown[] = [];
  let orderBy = ORDER_BY[match ? sort : sort === "relevance" ? "popularity" : sort];

  if (match && search.scope === "title" && sort === "relevance") {
    const needle = (search.query ?? "").trim().toLowerCase().slice(0, 120);

    orderBy = `${TITLE_EXACTNESS}, t.popularity DESC`;
    orderBindings.push(needle, needle);
  }

  const conditions = match
    ? ["catalog_search MATCH ?", ...eligibility.conditions]
    : eligibility.conditions;
  const bindings = match ? [match, ...eligibility.bindings] : eligibility.bindings;
  const from = match
    ? "catalog_search JOIN catalog_titles AS t ON t.rowid = catalog_search.rowid"
    : "catalog_titles AS t";
  const rows = await db
    .prepare(
      `SELECT ${catalogTitleColumns("t")}
       FROM ${from}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, ...orderBindings, limit, offset)
    .all<CatalogTitleRow>();

  return hydrate(db, rows.results);
}

export async function searchTitlesFirst(db: D1Database, search: CatalogueSearch) {
  const limit = clamp(Math.floor(search.limit ?? 12), 1, 60);

  if (!search.query?.trim()) {
    return searchCatalogue(db, search);
  }

  const byTitle = await searchCatalogue(db, {
    ...search,
    scope: "title",
    limit,
  });

  if (byTitle.length >= limit) {
    return byTitle;
  }

  const found = new Set(byTitle.map((title) => title.id));
  const rest = await searchCatalogue(db, {
    ...search,
    scope: "everything",
    limit,
    excludeIds: [...(search.excludeIds ?? []), ...found],
  });

  return [...byTitle, ...rest.filter((title) => !found.has(title.id))].slice(0, limit);
}

export type BrowseTrendingFilter = {
  mediaType?: "movie" | "tv";
  genres: string[];
  keywords: string[];
  places: string[];
  providerIds: string[];
  minVotes: number;
};

async function trendingCandidates(db: D1Database, filter: BrowseTrendingFilter) {
  const eligibility = eligibilityClause(filter);
  const conditions = [
    `b.article <> ''`,
    `b.views >= ${MIN_TRENDING_VIEWS}`,
    ...eligibility.conditions,
  ];
  const rows = await db
    .prepare(
      `SELECT ${catalogTitleColumns("t")}
       FROM title_buzz AS b
       JOIN catalog_titles AS t ON t.id = b.title_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY b.score DESC, t.popularity DESC`,
    )
    .bind(...eligibility.bindings)
    .all<CatalogTitleRow>();

  return rows.results;
}

export async function browseTrending(
  db: D1Database,
  filter: BrowseTrendingFilter,
  limit: number,
  offset: number,
) {
  const candidates = await trendingCandidates(db, filter);
  const page = candidates.slice(offset, offset + limit);

  if (page.length >= limit || offset + limit <= candidates.length) {
    return hydrate(db, page);
  }

  const rest = await searchCatalogue(db, {
    mediaType: filter.mediaType,
    genres: filter.genres,
    keywords: filter.keywords,
    places: filter.places,
    providerIds: filter.providerIds,
    minVotes: filter.minVotes,
    sort: "popularity",
    excludeIds: candidates.map((row) => row.id),
    limit: limit - page.length,
    offset: Math.max(0, offset - candidates.length),
  });

  return [...(await hydrate(db, page)), ...rest];
}

export async function readRanked(db: D1Database, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, 100);

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT ${CATALOG_TITLE_COLUMNS}
       FROM catalog_titles
       WHERE id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(uniqueIds))
    .all<CatalogTitleRow>();
  const byId = new Map((await hydrate(db, rows.results)).map((title) => [title.id, title]));

  return uniqueIds.flatMap((id) => {
    const title = byId.get(id);

    return title ? [title] : [];
  });
}

export async function readGenres(db: D1Database, limit = 100) {
  const rows = await db
    .prepare(
      `SELECT genre, count(*) AS titles
       FROM catalog_title_genres
       GROUP BY genre
       HAVING titles >= 5
       ORDER BY titles DESC
       LIMIT ?`,
    )
    .bind(clamp(limit, 1, 200))
    .all<{ genre: string; titles: number }>();

  return rows.results
    .filter((row) => typeof row.genre === "string" && row.genre.length > 0)
    .map((row) => row.genre);
}

export async function readKeywords(db: D1Database, limit = 120) {
  const rows = await db
    .prepare(
      `SELECT keyword, count(*) AS titles
       FROM catalog_title_keywords
       GROUP BY keyword
       HAVING titles >= 8
       ORDER BY titles DESC
       LIMIT ?`,
    )
    .bind(clamp(limit, 1, 400))
    .all<{ keyword: string; titles: number }>();

  return rows.results
    .filter((row) => typeof row.keyword === "string" && row.keyword.length > 0)
    .map((row) => row.keyword);
}

export async function readFilmingPlaces(db: D1Database, limit = 80) {
  const rows = await db
    .prepare(
      `SELECT cp.label, count(DISTINCT tp.title_id) AS titles
       FROM catalog_title_places AS tp
       JOIN catalog_places AS cp ON cp.entity_id = tp.place_id
       WHERE tp.kind = 'filming'
       GROUP BY cp.label
       HAVING titles >= 4
       ORDER BY titles DESC
       LIMIT ?`,
    )
    .bind(clamp(limit, 1, 300))
    .all<{ label: string; titles: number }>();

  return rows.results.map((row) => row.label);
}
