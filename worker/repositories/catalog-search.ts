import type { ViewerAccess } from "../../src/domain/access.ts";
import type { MediaTitle } from "../../src/domain/catalog.ts";
import { barredCertifications } from "../../src/domain/certification.ts";
import { searchTokens } from "../../src/domain/search-query.ts";
import { buzzScoreSql, MIN_TRENDING_VIEWS } from "../lib/buzz.ts";
import {
  CATALOG_TITLE_COLUMNS,
  catalogTitleColumns,
  type CatalogTitleRow,
  withStoredPoster,
} from "../lib/catalog-payload.ts";
import { MAX_QUERY_TOKENS, tsQueryFromTokens } from "../lib/fts.ts";
import { preferredAudioLanguageCondition } from "../lib/languages.ts";
import { clamp } from "../lib/numbers.ts";
import { providerFilterSql } from "../lib/providers.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import type { AvailabilityRule } from "../services/viewer/eligibility.ts";
import { hydrateTitleRows } from "./catalog-arrays.ts";

export type CatalogueSort = "trending" | "popularity" | "score" | "recent" | "relevance" | "given";

export type SearchScope = "title" | "everything";

const SCORE_SORT_MIN_VOTES = 50;
const INCLUDE_ID_LIMIT = 500;
const EXCLUDE_ID_LIMIT = 10_000;
const TRENDING_ID_LIMIT = 2_000;
const RANKED_CANDIDATE_LIMIT = 500;

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
  languages?: string[];
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

function ftsMatchQuery(raw: string, matchAny = false) {
  return tsQueryFromTokens(searchTokens(raw).slice(0, MAX_QUERY_TOKENS), matchAny);
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

const CERTIFICATION_LIMIT = 60;

function certifiedAs(alias: string, parameter: string) {
  return `EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(CAST(${parameter} AS jsonb)) AS rated(value)
         WHERE ${alias}.certification = rated.value OR ${alias}.certification LIKE '% ' || rated.value
       )`;
}

export function certificationBar(
  alias: string,
  bindings: DatabaseValue[],
  certifications: readonly string[],
) {
  const barred = certifications.filter(Boolean).slice(0, CERTIFICATION_LIMIT);

  return barred.length
    ? [`NOT ${certifiedAs(alias, `$${bindings.push(JSON.stringify(barred))}`)}`]
    : [];
}

export function certifiedWithin(
  alias: string,
  bindings: DatabaseValue[],
  certifications: readonly string[],
) {
  const wanted = certifications.filter(Boolean).slice(0, CERTIFICATION_LIMIT);

  return certifiedAs(alias, `$${bindings.push(JSON.stringify(wanted))}`);
}

function eligibilityClause(search: CatalogueSearch, bindings: DatabaseValue[]): Eligibility {
  const conditions: string[] = [];
  const genres = lowered(search.genres, 10);
  const places = lowered(search.places, 6);
  const keywords = lowered(search.keywords, 6);
  const providerIds = validProviderIds(search.providerIds);
  const excludeGenres = lowered(search.excludeGenres, 20);
  const languages = lowered(search.languages, 10).filter((language) =>
    /^[a-z]{2}$/u.test(language),
  );
  const excludedIds = [...new Set((search.excludeIds ?? []).filter(isKnownTitle))].slice(
    0,
    EXCLUDE_ID_LIMIT,
  );
  const providerIdsParameter = providerIds.length
    ? `$${bindings.push(JSON.stringify(providerIds))}`
    : undefined;

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

  if (providerIdsParameter) {
    conditions.push(availabilityCondition("t", providerIdsParameter, search.availability));
  }

  if (excludeGenres.length) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM catalog_title_genres AS bg
         WHERE bg.title_id = t.id AND lower(bg.genre) IN (${excludeGenres.map((genre) => `$${bindings.push(genre)}`).join(", ")})
       )`,
    );
  }

  if (languages.length) {
    const languageProviderParameter = providerIds.length
      ? `$${bindings.push(JSON.stringify(providerIds))}`
      : undefined;

    conditions.push(
      `(${languages
        .map((language) =>
          preferredAudioLanguageCondition("t", `$${bindings.push(language)}`, {
            providerIdsExpression: languageProviderParameter,
          }),
        )
        .join(" OR ")})`,
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

  conditions.push(...certificationBar("t", bindings, search.certifications ?? []));

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

function exactTitlesFirst(rows: CatalogTitleRow[], needle: string) {
  if (!needle) {
    return rows;
  }

  const isExact = (row: CatalogTitleRow) =>
    row.title.toLowerCase() === needle || row.original_title.toLowerCase() === needle;

  return [...rows.filter(isExact), ...rows.filter((row) => !isExact(row))];
}

export async function searchCatalogueRows(db: Database, search: CatalogueSearch) {
  const query = (search.query ?? "").trim().slice(0, 120);
  const match = query ? ftsMatchQuery(query, search.matchAny) : null;
  const limit = clamp(Math.floor(search.limit ?? 12), 1, 60);
  const offset = clamp(Math.floor(search.offset ?? 0), 0, 2_000);
  const sort = search.sort ?? (match ? "relevance" : "popularity");
  const scope: SearchScope = search.scope === "title" ? "title" : "everything";
  const document = scope === "title" ? "title_document" : "document";
  const bindings: DatabaseValue[] = [];
  const matchParameter = match ? `$${bindings.push(match)}` : null;
  const bounded = Boolean(matchParameter) && sort === "relevance";
  const candidateParameter = bounded
    ? `$${bindings.push(Math.max(RANKED_CANDIDATE_LIMIT, offset + limit))}`
    : null;
  const conditions =
    matchParameter && !bounded
      ? [`catalog_search.${document} @@ to_tsquery('simple', ${matchParameter})`]
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

  if (bounded && scope !== "title") {
    orderBy = `ts_rank_cd(candidates.${document}, to_tsquery('simple', ${matchParameter}), 32) DESC,
      t.popularity DESC`;
  }

  if (sort === "given" && eligibility.includedIds) {
    orderBy = `(SELECT position
                  FROM jsonb_array_elements_text(CAST($${bindings.push(JSON.stringify(eligibility.includedIds))} AS jsonb))
                    WITH ORDINALITY AS entries(value, position)
                 WHERE value = t.id)`;
  }

  const candidates = bounded
    ? `WITH candidates AS MATERIALIZED (
         SELECT s.title_id${scope === "title" ? "" : `, s.${document}`}
           FROM catalog_search AS s
           JOIN catalog_titles AS c ON c.id = s.title_id
          WHERE s.${document} @@ to_tsquery('simple', ${matchParameter})
          ORDER BY c.popularity DESC
          LIMIT ${candidateParameter}
       ) `
    : "";
  const from = bounded
    ? "candidates JOIN catalog_titles AS t ON t.id = candidates.title_id"
    : match
      ? "catalog_search JOIN catalog_titles AS t ON t.id = catalog_search.title_id"
      : "catalog_titles AS t";
  const rows = await db.query<CatalogTitleRow>(
    `${candidates}SELECT ${catalogTitleColumns("t")}
       FROM ${from}
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${orderBy}
       LIMIT $${bindings.push(limit)} OFFSET $${bindings.push(offset)}`,
    bindings,
  );

  return bounded && scope === "title"
    ? exactTitlesFirst(rows.rows, query.toLowerCase())
    : rows.rows;
}

export async function searchCatalogue(db: Database, search: CatalogueSearch) {
  return hydrate(db, await searchCatalogueRows(db, search));
}

export async function searchTitlesFirstRows(db: Database, search: CatalogueSearch) {
  const limit = clamp(Math.floor(search.limit ?? 12), 1, 60);

  if (!search.query?.trim()) {
    return searchCatalogueRows(db, search);
  }

  const byTitle = await searchCatalogueRows(db, {
    ...search,
    scope: "title",
    limit,
  });

  if (byTitle.length >= limit) {
    return byTitle;
  }

  const found = new Set(byTitle.map((row) => row.id));
  const rest = await searchCatalogueRows(db, {
    ...search,
    scope: "everything",
    limit: limit - byTitle.length,
    excludeIds: [...(search.excludeIds ?? []), ...found],
  });

  return [...byTitle, ...rest.filter((row) => !found.has(row.id))].slice(0, limit);
}

export async function searchTitlesFirst(db: Database, search: CatalogueSearch) {
  return hydrate(db, await searchTitlesFirstRows(db, search));
}

export type BrowseTrendingFilter = {
  mediaType?: "movie" | "tv";
  genres: string[];
  keywords: string[];
  places: string[];
  providerIds: string[];
  availability?: AvailabilityRule;
  certifications?: string[];
  minVotes: number;
};

function trendingConditions(filter: BrowseTrendingFilter, bindings: DatabaseValue[]) {
  const eligibility = eligibilityClause(filter, bindings);

  return [`b.article <> ''`, `b.views >= ${MIN_TRENDING_VIEWS}`, ...eligibility.conditions].join(
    " AND ",
  );
}

const TRENDING_ORDER = "ORDER BY b.score DESC, t.popularity DESC";
const TRENDING_FROM = "FROM title_buzz AS b JOIN catalog_titles AS t ON t.id = b.title_id";

async function trendingPage(
  db: Database,
  filter: BrowseTrendingFilter,
  limit: number,
  offset: number,
) {
  const bindings: DatabaseValue[] = [];
  const where = trendingConditions(filter, bindings);
  const rows = await db.query<CatalogTitleRow>(
    `SELECT ${catalogTitleColumns("t")}
       ${TRENDING_FROM}
       WHERE ${where}
       ${TRENDING_ORDER}
       LIMIT $${bindings.push(limit)} OFFSET $${bindings.push(offset)}`,
    bindings,
  );

  return rows.rows;
}

async function trendingIds(db: Database, filter: BrowseTrendingFilter) {
  const bindings: DatabaseValue[] = [];
  const where = trendingConditions(filter, bindings);
  const rows = await db.query<{ id: string }>(
    `SELECT t.id
       ${TRENDING_FROM}
       WHERE ${where}
       ${TRENDING_ORDER}
       LIMIT $${bindings.push(TRENDING_ID_LIMIT)}`,
    bindings,
  );

  return rows.rows.map((row) => row.id);
}

export async function browseTrending(
  db: Database,
  filter: BrowseTrendingFilter,
  limit: number,
  offset: number,
) {
  const page = await trendingPage(db, filter, limit, offset);

  if (page.length >= limit) {
    return hydrate(db, page);
  }

  const trending = await trendingIds(db, filter);
  const rest = await searchCatalogue(db, {
    mediaType: filter.mediaType,
    genres: filter.genres,
    keywords: filter.keywords,
    places: filter.places,
    providerIds: filter.providerIds,
    availability: filter.availability,
    minVotes: filter.minVotes,
    sort: "popularity",
    excludeIds: trending,
    limit: limit - page.length,
    offset: Math.max(0, offset - trending.length),
  });

  return [...(await hydrate(db, page)), ...rest];
}

export async function readRanked(db: Database, ids: string[], access: ViewerAccess) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, 100);

  if (uniqueIds.length === 0) {
    return [];
  }

  const bindings: DatabaseValue[] = [JSON.stringify(uniqueIds)];
  const conditions = [
    "id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))",
    ...certificationBar("catalog_titles", bindings, barredCertifications(access)),
  ];
  const rows = await db.query<CatalogTitleRow>(
    `SELECT ${CATALOG_TITLE_COLUMNS}
       FROM catalog_titles
       WHERE ${conditions.join(" AND ")}`,
    bindings,
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
