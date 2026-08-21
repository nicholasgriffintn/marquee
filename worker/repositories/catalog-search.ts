import type { MediaTitle } from "../../src/domain/catalog.ts";
import { parseStoredTitle } from "../lib/catalog-payload.ts";
import { curatorCandidates, isKnownTitle, validProviderIds } from "../lib/validation.ts";

type PayloadRow = { payload: string };

export type CatalogueSearch = {
  query?: string;
  genres?: string[];
  mediaType?: "movie" | "tv";
  providerIds?: string[];
  minScore?: number;
  excludeIds?: string[];
  limit?: number;
};

function includesProvider(item: MediaTitle, providerIds: string[]) {
  return (
    providerIds.length === 0 || item.providers.some((provider) => providerIds.includes(provider.id))
  );
}

export async function searchCatalogue(db: D1Database, search: CatalogueSearch) {
  const rows = await db
    .prepare(
      `SELECT payload
       FROM catalog_titles
       ORDER BY popularity DESC
       LIMIT 200`,
    )
    .all<PayloadRow>();

  const query = search.query?.trim().toLowerCase().slice(0, 100) ?? "";
  const genres = (search.genres ?? [])
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  const providerIds = validProviderIds(search.providerIds);
  const excludedIds = new Set((search.excludeIds ?? []).filter(isKnownTitle));
  const minimumScore = Number.isFinite(search.minScore)
    ? Math.max(0, Math.min(10, search.minScore ?? 0))
    : 0;
  const limit = Math.max(1, Math.min(20, Math.floor(search.limit ?? 12)));

  const matches = rows.results
    .flatMap((row) => {
      const title = parseStoredTitle(row.payload);

      return title ? [title] : [];
    })
    .filter((title) => !excludedIds.has(title.id))
    .filter((title) => !search.mediaType || title.mediaType === search.mediaType)
    .filter(
      (title) =>
        !query ||
        `${title.title} ${title.originalTitle} ${title.overview}`.toLowerCase().includes(query),
    )
    .filter(
      (title) =>
        genres.length === 0 ||
        genres.some((genre) =>
          title.genres.some((titleGenre) => titleGenre.toLowerCase() === genre),
        ),
    )
    .filter((title) => includesProvider(title, providerIds))
    .filter((title) => (title.tmdbScore ?? 0) >= minimumScore)
    .slice(0, limit);

  return curatorCandidates(matches);
}
