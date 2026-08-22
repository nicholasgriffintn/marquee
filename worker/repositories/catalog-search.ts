import { parseStoredTitle } from "../lib/catalog-payload.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";

type PayloadRow = { payload: string; posterKey?: string | null };

export type CatalogueSort = "popularity" | "score" | "recent";

const VOTE_PRIOR = 250;
const MEAN_SCORE = 6.5;
const SCORE_SORT_MIN_VOTES = 50;

const WEIGHTED_RATING = `(
  (COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0) * COALESCE(json_extract(payload, '$.tmdbScore'), 0))
  + (${VOTE_PRIOR} * ${MEAN_SCORE})
) / (COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0) + ${VOTE_PRIOR})`;

export type CatalogueSearch = {
  query?: string;
  minVotes?: number;
  genres?: string[];
  mediaType?: "movie" | "tv";
  providerIds?: string[];
  minScore?: number;
  releasedAfter?: number;
  excludeIds?: string[];
  sort?: CatalogueSort;
  limit?: number;
  offset?: number;
};

const ORDER_BY: Record<CatalogueSort, string> = {
  popularity: "popularity DESC",
  score: `${WEIGHTED_RATING} DESC, popularity DESC`,
  recent: "COALESCE(year, 0) DESC, popularity DESC",
};

export async function searchCatalogue(db: D1Database, search: CatalogueSearch) {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const query = search.query?.trim().toLowerCase().slice(0, 100) ?? "";
  const genres = (search.genres ?? [])
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  const providerIds = validProviderIds(search.providerIds);
  const excludedIds = [...new Set((search.excludeIds ?? []).filter(isKnownTitle))].slice(0, 300);
  const limit = Math.max(1, Math.min(60, Math.floor(search.limit ?? 12)));
  const offset = Math.max(0, Math.min(2_000, Math.floor(search.offset ?? 0)));

  if (search.mediaType === "movie" || search.mediaType === "tv") {
    conditions.push("media_type = ?");
    bindings.push(search.mediaType);
  }

  if (query) {
    conditions.push(
      `(instr(lower(title), ?) > 0
        OR instr(lower(original_title), ?) > 0
        OR instr(lower(COALESCE(json_extract(payload, '$.overview'), '')), ?) > 0)`,
    );
    bindings.push(query, query, query);
  }

  if (genres.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM json_each(payload, '$.genres')
         WHERE lower(json_each.value) IN (${genres.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...genres);
  }

  if (providerIds.length) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM json_each(provider_ids)
         WHERE json_each.value IN (${providerIds.map(() => "?").join(", ")})
       )`,
    );
    bindings.push(...providerIds);
  }

  if (Number.isFinite(search.minScore)) {
    conditions.push("COALESCE(json_extract(payload, '$.tmdbScore'), 0) >= ?");
    bindings.push(Math.max(0, Math.min(10, search.minScore ?? 0)));
  }

  const minVotes = Number.isFinite(search.minVotes)
    ? Math.max(0, Math.trunc(search.minVotes ?? 0))
    : search.sort === "score" || Number.isFinite(search.minScore)
      ? SCORE_SORT_MIN_VOTES
      : 0;

  if (minVotes > 0) {
    conditions.push("COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0) >= ?");
    bindings.push(minVotes);
  }

  if (Number.isFinite(search.releasedAfter)) {
    conditions.push("COALESCE(year, 0) >= ?");
    bindings.push(Math.max(1900, Math.min(2100, Math.trunc(search.releasedAfter ?? 0))));
  }

  if (excludedIds.length) {
    conditions.push(`id NOT IN (${excludedIds.map(() => "?").join(", ")})`);
    bindings.push(...excludedIds);
  }

  const rows = await db
    .prepare(
      `SELECT payload, poster_key AS posterKey
       FROM catalog_titles
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${ORDER_BY[search.sort ?? "popularity"]}
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, limit, offset)
    .all<PayloadRow>();
  const matches = rows.results.flatMap((row) => {
    const title = parseStoredTitle(row.payload);

    return title
      ? [row.posterKey ? { ...title, posterUrl: `/media/${row.posterKey}` } : title]
      : [];
  });

  return matches;
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
