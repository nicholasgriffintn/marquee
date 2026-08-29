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
const INCLUDE_ID_LIMIT = 500;
const EXCLUDE_ID_LIMIT = 2_000;

const WEIGHTED_RATING = "t.weighted_rating";
const BLENDED_RATING = "t.blended_rating";

const BUZZ_SCORE = buzzScoreSql("t.id");

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

type Eligibility = {
  conditions: string[];
  includedIds: string[] | null;
  impossible: boolean;
};

function hasProviders(alias: string) {
  return `EXISTS (SELECT 1 FROM catalog_title_providers AS p WHERE p.title_id = ${alias}.id)`;
}

export function availabilityCondition(
  alias: string,
  providerIdsParameter: string,
  availability: AvailabilityRule = "confirmed",
) {
  const confirmedOrUnknown = providerFilterSql(`${alias}.id`, providerIdsParameter);

  return availability === "confirmed-or-unknown"
    ? confirmedOrUnknown
    : `(${hasProviders(alias)} AND ${confirmedOrUnknown})`;
}

const ORDER_BY: Record<CatalogueSort, string> = {
  trending: `${BUZZ_SCORE} DESC, t.popularity DESC`,
  popularity: "t.popularity DESC",
  score: `${WEIGHTED_RATING} DESC, t.popularity DESC`,
  recent: "COALESCE(t.year, 0) DESC, t.popularity DESC",
  relevance: "t.popularity DESC",
  given: "t.popularity DESC",
};

function ftsMatchQuery(raw: string, scope: SearchScope = "everything", matchAny = false) {
  const tokens = searchTokens(raw).slice(0, MAX_QUERY_TOKENS);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `${token}:*`).join(matchAny ? " | " : " & ");
}

function lowered(values: string[] | undefined, limit: number) {
  return (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, limit);
}

function tagCondition(table: string, column: string, parameters: string[]) {
  return `EXISTS (
         SELECT 1 FROM ${table} AS x
         WHERE x.title_id = t.id AND lower(x.${column}) IN (${parameters.join(", ")})
       )`;
}

function placeCondition(parameters: string[]) {
  return `EXISTS (
         SELECT 1 FROM catalog_title_places AS tp
         JOIN catalog_places AS cp ON cp.entity_id = tp.place_id
         WHERE tp.title_id = t.id AND tp.kind = 'filming'
           AND lower(cp.label) IN (${parameters.join(", ")})
       )`;
}

function eligibilityClause(search: CatalogueSearch, bindings: DatabaseValue[]): Eligibility {
  const conditions: string[] = [];
  const genres = lowered(search.genres, 10);
  const places = lowered(search.places, 6);
  const keywords = lowered(search.keywords, 6);
  const providerIds = validProviderIds(search.providerIds);
  const excludeGenres = lowered(search.excludeGenres, 20);
  const excludedIds = [...new Set((search.excludeIds ?? []).filter(isKnownTitle))].slice(
    0,
    EXCLUDE_ID_LIMIT,
  );

  if (search.mediaType === "movie" || search.mediaType === "tv") {
    conditions.push(`t.media_type = $${bindings.push(search.mediaType)}`);
  }

  if (genres.length) {
    conditions.push(
      tagCondition(
        "catalog_title_genres",
        "genre",
        genres.map((genre) => `$${bindings.push(genre)}`),
      ),
    );
  }

  if (places.length) {
    conditions.push(placeCondition(places.map((place) => `$${bindings.push(place)}`)));
  }

  if (keywords.length) {
    conditions.push(
      tagCondition(
        "catalog_title_keywords",
        "keyword",
        keywords.map((keyword) => `$${bindings.push(keyword)}`),
      ),
    );
  }

  if (providerIds.length) {
    conditions.push(
      availabilityCondition(
        "t",
        `$${bindings.push(JSON.stringify(providerIds))}`,
        search.availability,
      ),
    );
  }

  if (excludeGenres.length) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM catalog_title_genres AS bg
         WHERE bg.title_id = t.id AND lower(bg.genre) IN (${excludeGenres.map((genre) => `$${bindings.push(genre)}`).join(", ")})
       )`,
    );
  }

  if (Number.isFinite(search.minScore)) {
    conditions.push(`${BLENDED_RATING} >= $${bindings.push(clamp(search.minScore ?? 0, 0, 10))}`);
  }

  if (Number.isFinite(search.minVotes) && (search.minVotes ?? 0) > 0) {
    conditions.push(`t.vote_count >= $${bindings.push(Math.trunc(search.minVotes ?? 0))}`);
  }

  if (Number.isFinite(search.maxRuntime)) {
    conditions.push(
      `(t.runtime_minutes IS NOT NULL AND t.runtime_minutes <= $${bindings.push(clamp(Math.trunc(search.maxRuntime ?? 600), 30, 600))})`,
    );
  }

  const certifications = (search.certifications ?? []).filter(Boolean).slice(0, 60);

  if (certifications.length) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(CAST($${bindings.push(JSON.stringify(certifications))} AS jsonb)) AS rated(value)
         WHERE t.certification = rated.value OR t.certification LIKE '% ' || rated.value
       )`,
    );
  }

  if (Number.isFinite(search.releasedAfter)) {
    conditions.push(
      `COALESCE(t.year, 0) >= $${bindings.push(clamp(Math.trunc(search.releasedAfter ?? 0), 1900, 2100))}`,
    );
  }

  if (excludedIds.length) {
    conditions.push(
      `t.id NOT IN (SELECT value FROM jsonb_array_elements_text(CAST($${bindings.push(JSON.stringify(excludedIds))} AS jsonb)) AS entries(value))`,
    );
  }

  if (!search.includeIds) {
    return { conditions, includedIds: null, impossible: false };
  }

  const includedIds = [...new Set(search.includeIds.filter(isKnownTitle))].slice(
    0,
    INCLUDE_ID_LIMIT,
  );

  conditions.push(
    `t.id IN (SELECT value FROM jsonb_array_elements_text(CAST($${bindings.push(JSON.stringify(includedIds))} AS jsonb)) AS entries(value))`,
  );

  return { conditions, includedIds, impossible: includedIds.length === 0 };
}

function requiredVotes(search: CatalogueSearch, sort: CatalogueSort) {
  if (Number.isFinite(search.minVotes)) {
    return Math.max(0, Math.trunc(search.minVotes ?? 0));
  }

  return sort === "score" || Number.isFinite(search.minScore) ? SCORE_SORT_MIN_VOTES : 0;
}

async function hydrate(db: Database, rows: CatalogTitleRow[]): Promise<MediaTitle[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.map((title, index) => withStoredPoster(title, rows[index]?.poster_key));
}

export async function searchCatalogue(db: Database, search: CatalogueSearch) {
  const match = search.query?.trim()
    ? ftsMatchQuery(search.query.trim().slice(0, 120), search.scope, search.matchAny)
    : null;
  const limit = clamp(Math.floor(search.limit ?? 12), 1, 60);
  const offset = clamp(Math.floor(search.offset ?? 0), 0, 2_000);
  const sort = search.sort ?? (match ? "relevance" : "popularity");
  const bindings: DatabaseValue[] = [];
  const conditions = match
    ? [
        `catalog_search.${search.scope === "title" ? "title_document" : "document"} @@ to_tsquery('simple', $${bindings.push(match)})`,
      ]
    : [];
  const eligibility = eligibilityClause(
    { ...search, minVotes: requiredVotes(search, sort) },
    bindings,
  );

  conditions.push(...eligibility.conditions);

  if (eligibility.impossible) {
    return [];
  }

  let orderBy = ORDER_BY[match ? sort : sort === "relevance" ? "popularity" : sort];
  const searchDocument = search.scope === "title" ? "title_document" : "document";

  if (match && sort === "relevance" && search.scope !== "title") {
    orderBy = `ts_rank_cd(catalog_search.${searchDocument}, to_tsquery('simple', $${bindings.push(match)}), 32) DESC,
      t.popularity DESC`;
  }

  if (sort === "given" && eligibility.includedIds) {
    orderBy = `(SELECT position
                  FROM jsonb_array_elements_text(CAST($${bindings.push(JSON.stringify(eligibility.includedIds))} AS jsonb))
                    WITH ORDINALITY AS entries(value, position)
                 WHERE value = t.id)`;
  }

  if (match && search.scope === "title" && sort === "relevance") {
    const needle = (search.query ?? "").trim().toLowerCase().slice(0, 120);

    const titleParameter = `$${bindings.push(needle)}`;
    const originalTitleParameter = `$${bindings.push(needle)}`;

    orderBy = `(CASE WHEN lower(t.title) = ${titleParameter} OR lower(t.original_title) = ${originalTitleParameter} THEN 0 ELSE 1 END), t.popularity DESC`;
  }

  const from = match
    ? "catalog_search JOIN catalog_titles AS t ON t.id = catalog_search.title_id"
    : "catalog_titles AS t";
  const rows = await db.query<CatalogTitleRow>(
    `SELECT ${catalogTitleColumns("t")}
       FROM ${from}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${orderBy}
       LIMIT $${bindings.push(limit)} OFFSET $${bindings.push(offset)}`,
    bindings,
  );

  return hydrate(db, rows.rows);
}

export async function searchTitlesFirst(db: Database, search: CatalogueSearch) {
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

async function trendingCandidates(db: Database, filter: BrowseTrendingFilter) {
  const bindings: DatabaseValue[] = [];
  const eligibility = eligibilityClause(filter, bindings);
  const conditions = [
    `b.article <> ''`,
    `b.views >= ${MIN_TRENDING_VIEWS}`,
    ...eligibility.conditions,
  ];
  const rows = await db.query<CatalogTitleRow>(
    `SELECT ${catalogTitleColumns("t")}
       FROM title_buzz AS b
       JOIN catalog_titles AS t ON t.id = b.title_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY b.score DESC, t.popularity DESC`,
    bindings,
  );

  return rows.rows;
}

export async function browseTrending(
  db: Database,
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
    availability: filter.availability,
    minVotes: filter.minVotes,
    sort: "popularity",
    excludeIds: candidates.map((row) => row.id),
    limit: limit - page.length,
    offset: Math.max(0, offset - candidates.length),
  });

  return [...(await hydrate(db, page)), ...rest];
}

export async function readRanked(db: Database, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, 100);

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await db.query<CatalogTitleRow>(
    `SELECT ${CATALOG_TITLE_COLUMNS}
       FROM catalog_titles
       WHERE id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))`,
    [JSON.stringify(uniqueIds)],
  );
  const byId = new Map((await hydrate(db, rows.rows)).map((title) => [title.id, title]));

  return uniqueIds.flatMap((id) => {
    const title = byId.get(id);

    return title ? [title] : [];
  });
}

export const GENRE_LIMIT_MAX = 200;

export async function readGenres(db: Database, limit = 100) {
  const rows = await db.query<{ genre: string; titles: number }>(
    `SELECT genre, count(*) AS titles
       FROM catalog_title_genres
       GROUP BY genre
       HAVING count(*) >= 5
       ORDER BY titles DESC
       LIMIT $1`,
    [clamp(limit, 1, GENRE_LIMIT_MAX)],
  );

  return rows.rows
    .filter((row) => typeof row.genre === "string" && row.genre.length > 0)
    .map((row) => row.genre);
}

export const KEYWORD_LIMIT_MAX = 400;

export async function readKeywords(db: Database, limit = 120) {
  const rows = await db.query<{ keyword: string; titles: number }>(
    `SELECT keyword, count(*) AS titles
       FROM catalog_title_keywords
       GROUP BY keyword
       HAVING count(*) >= 8
       ORDER BY titles DESC
       LIMIT $1`,
    [clamp(limit, 1, KEYWORD_LIMIT_MAX)],
  );

  return rows.rows
    .filter((row) => typeof row.keyword === "string" && row.keyword.length > 0)
    .map((row) => row.keyword);
}

export const PLACE_LIMIT_MAX = 300;

export async function readFilmingPlaces(db: Database, limit = 80) {
  const rows = await db.query<{ label: string; titles: number }>(
    `SELECT cp.label, count(DISTINCT tp.title_id) AS titles
       FROM catalog_title_places AS tp
       JOIN catalog_places AS cp ON cp.entity_id = tp.place_id
       WHERE tp.kind = 'filming'
       GROUP BY cp.label
       HAVING count(DISTINCT tp.title_id) >= 4
       ORDER BY titles DESC
       LIMIT $1`,
    [clamp(limit, 1, PLACE_LIMIT_MAX)],
  );

  return rows.rows.map((row) => row.label);
}
