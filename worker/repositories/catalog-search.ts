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
import { providerFilterSql } from "../lib/providers.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import type { AvailabilityRule } from "../services/viewer/eligibility.ts";
import { hydrateTitleRows } from "./catalog-arrays.ts";

export type CatalogueSort = "trending" | "popularity" | "score" | "recent" | "relevance" | "given";

export type SearchScope = "title" | "everything";

const SCORE_SORT_MIN_VOTES = 50;
const MAX_QUERY_TOKENS = 8;

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
  availability?: AvailabilityRule;
  minScore?: number;
  releasedAfter?: number;
  maxRuntime?: number;
  excludeIds?: string[];
  excludeGenres?: string[];
  includeIds?: string[];
  certifications?: string[];
  sort?: CatalogueSort;
  scope?: SearchScope;
  matchAny?: boolean;
  limit?: number;
  offset?: number;
};

function hasProviders(alias: string) {
  return `EXISTS (SELECT 1 FROM catalog_title_providers AS p WHERE p.title_id = ${alias}.id)`;
}

export function availabilityCondition(alias: string, availability: AvailabilityRule = "confirmed") {
  const confirmedOrUnknown = providerFilterSql(`${alias}.id`);

  return availability === "confirmed-or-unknown"
    ? confirmedOrUnknown
    : `(${hasProviders(alias)} AND ${confirmedOrUnknown})`;
}

const TITLE_EXACTNESS = `(CASE WHEN lower(t.title) = ? OR lower(t.original_title) = ? THEN 0 ELSE 1 END)`;

const ORDER_BY: Record<CatalogueSort, string> = {
  trending: `${BUZZ_SCORE} DESC, t.popularity DESC`,
  popularity: "t.popularity DESC",
  score: `${WEIGHTED_RATING} DESC, t.popularity DESC`,
  recent: "COALESCE(t.year, 0) DESC, t.popularity DESC",
  relevance: `${RELEVANCE}, t.popularity DESC`,
  given: "t.popularity DESC",
};

function ftsMatchQuery(raw: string, scope: SearchScope = "everything", matchAny = false) {
  const tokens = searchTokens(raw).slice(0, MAX_QUERY_TOKENS);

  if (tokens.length === 0) {
    return null;
  }

  const expression = tokens.map((token) => `"${token}"*`).join(matchAny ? " OR " : " AND ");

  return scope === "title" ? `{title original_title} : (${expression})` : expression;
}

async function hydrate(db: D1Database, rows: CatalogTitleRow[]): Promise<MediaTitle[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.map((title, index) => withStoredPoster(title, rows[index]?.poster_key));
}

export async function searchCatalogue(db: D1Database, search: CatalogueSearch) {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const match = search.query?.trim()
    ? ftsMatchQuery(search.query.trim().slice(0, 120), search.scope, search.matchAny)
    : null;
  const genres = (search.genres ?? [])
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  const providerIds = validProviderIds(search.providerIds);
  const excludeGenres = (search.excludeGenres ?? [])
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  const excludedIds = [...new Set((search.excludeIds ?? []).filter(isKnownTitle))].slice(0, 2_000);
  const limit = clamp(Math.floor(search.limit ?? 12), 1, 60);
  const offset = clamp(Math.floor(search.offset ?? 0), 0, 2_000);
  const sort = search.sort ?? (match ? "relevance" : "popularity");
  const orderBindings: unknown[] = [];
  let orderBy = ORDER_BY[match ? sort : sort === "relevance" ? "popularity" : sort];

  if (match && search.scope === "title" && sort === "relevance") {
    const needle = (search.query ?? "").trim().toLowerCase().slice(0, 120);

    orderBy = `${TITLE_EXACTNESS}, t.popularity DESC`;
    orderBindings.push(needle, needle);
  }

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
         SELECT 1 FROM catalog_title_genres AS g
         WHERE g.title_id = t.id AND lower(g.genre) IN (${genres.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...genres);
  }

  const places = (search.places ?? [])
    .map((place) => place.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

  if (places.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM catalog_title_places AS tp
         JOIN catalog_places AS cp ON cp.entity_id = tp.place_id
         WHERE tp.title_id = t.id AND tp.kind = 'filming'
           AND lower(cp.label) IN (${places.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...places);
  }

  const keywords = (search.keywords ?? [])
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

  if (keywords.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM catalog_title_keywords AS k
         WHERE k.title_id = t.id AND lower(k.keyword) IN (${keywords.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...keywords);
  }

  if (providerIds.length) {
    conditions.push(availabilityCondition("t", search.availability));
    bindings.push(JSON.stringify(providerIds));
  }

  if (excludeGenres.length) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM catalog_title_genres AS bg
         WHERE bg.title_id = t.id AND lower(bg.genre) IN (${excludeGenres.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...excludeGenres);
  }

  if (Number.isFinite(search.minScore)) {
    conditions.push(`${BLENDED_RATING} >= ?`);
    bindings.push(clamp(search.minScore ?? 0, 0, 10));
  }

  const minVotes = Number.isFinite(search.minVotes)
    ? Math.max(0, Math.trunc(search.minVotes ?? 0))
    : sort === "score" || Number.isFinite(search.minScore)
      ? SCORE_SORT_MIN_VOTES
      : 0;

  if (minVotes > 0) {
    conditions.push("t.vote_count >= ?");
    bindings.push(minVotes);
  }

  if (Number.isFinite(search.maxRuntime)) {
    conditions.push(`(t.runtime_minutes IS NOT NULL AND t.runtime_minutes <= ?)`);
    bindings.push(clamp(Math.trunc(search.maxRuntime ?? 600), 30, 600));
  }

  const certifications = (search.certifications ?? []).filter(Boolean).slice(0, 60);

  if (certifications.length) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM json_each(?) AS rated
         WHERE t.certification = rated.value OR t.certification LIKE '% ' || rated.value
       )`,
    );
    bindings.push(JSON.stringify(certifications));
  }

  if (Number.isFinite(search.releasedAfter)) {
    conditions.push("COALESCE(t.year, 0) >= ?");
    bindings.push(clamp(Math.trunc(search.releasedAfter ?? 0), 1900, 2100));
  }

  if (excludedIds.length) {
    conditions.push(`t.id NOT IN (SELECT value FROM json_each(?))`);
    bindings.push(JSON.stringify(excludedIds));
  }

  if (search.includeIds) {
    const includedIds = [...new Set(search.includeIds.filter(isKnownTitle))].slice(0, 200);

    if (includedIds.length === 0) {
      return [];
    }

    const encoded = JSON.stringify(includedIds);

    conditions.push(`t.id IN (SELECT value FROM json_each(?))`);
    bindings.push(encoded);

    if (sort === "given") {
      orderBy = `(SELECT key FROM json_each(?) WHERE value = t.id)`;
      orderBindings.push(encoded);
    }
  }

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
  availability?: AvailabilityRule;
  minVotes: number;
};

async function trendingCandidates(db: D1Database, filter: BrowseTrendingFilter) {
  const conditions = [`b.article <> ''`, `b.views >= ${MIN_TRENDING_VIEWS}`];
  const bindings: unknown[] = [];

  if (filter.mediaType === "movie" || filter.mediaType === "tv") {
    conditions.push("t.media_type = ?");
    bindings.push(filter.mediaType);
  }

  const genres = filter.genres
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  if (genres.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM catalog_title_genres AS g
         WHERE g.title_id = t.id AND lower(g.genre) IN (${genres.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...genres);
  }

  const places = filter.places
    .map((place) => place.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

  if (places.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM catalog_title_places AS tp
         JOIN catalog_places AS cp ON cp.entity_id = tp.place_id
         WHERE tp.title_id = t.id AND tp.kind = 'filming'
           AND lower(cp.label) IN (${places.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...places);
  }

  const keywords = filter.keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

  if (keywords.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM catalog_title_keywords AS k
         WHERE k.title_id = t.id AND lower(k.keyword) IN (${keywords.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...keywords);
  }

  const providerIds = validProviderIds(filter.providerIds);

  if (providerIds.length) {
    conditions.push(availabilityCondition("t", filter.availability));
    bindings.push(JSON.stringify(providerIds));
  }

  if (filter.minVotes > 0) {
    conditions.push("t.vote_count >= ?");
    bindings.push(filter.minVotes);
  }

  const rows = await db
    .prepare(
      `SELECT ${catalogTitleColumns("t")}
       FROM title_buzz AS b
       JOIN catalog_titles AS t ON t.id = b.title_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY b.score DESC, t.popularity DESC`,
    )
    .bind(...bindings)
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
