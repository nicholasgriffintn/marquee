import { parseStoredTitle } from "../lib/catalog-payload.ts";
import { curatorCandidates, isKnownTitle, validProviderIds } from "../lib/validation.ts";

type PayloadRow = { payload: string };

export type CatalogueSort = "popularity" | "score" | "recent";

export type CatalogueSearch = {
  query?: string;
  genres?: string[];
  mediaType?: "movie" | "tv";
  providerIds?: string[];
  minScore?: number;
  releasedAfter?: number;
  excludeIds?: string[];
  sort?: CatalogueSort;
  limit?: number;
};

const ORDER_BY: Record<CatalogueSort, string> = {
  popularity: "popularity DESC",
  score: "COALESCE(json_extract(payload, '$.tmdbScore'), 0) DESC, popularity DESC",
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
  const limit = Math.max(1, Math.min(30, Math.floor(search.limit ?? 12)));

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
      `SELECT payload
       FROM catalog_titles
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${ORDER_BY[search.sort ?? "popularity"]}
       LIMIT ?`,
    )
    .bind(...bindings, limit)
    .all<PayloadRow>();
  const matches = rows.results.flatMap((row) => {
    const title = parseStoredTitle(row.payload);

    return title ? [title] : [];
  });

  return curatorCandidates(matches);
}
