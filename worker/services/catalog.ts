import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { readAvailability, readCatalog, readItems } from "../repositories/catalog-reader.ts";
import {
  readGenres,
  readKeywords,
  readRanked,
  searchCatalogue as queryCatalogue,
} from "../repositories/catalog-search.ts";
import { readProviders } from "../repositories/providers.ts";
import type { Bindings } from "../types.ts";
import { readTrending } from "./buzz.ts";
import { findPendingTitles } from "./discovery.ts";
import { readTonight } from "./schedule.ts";

export async function getCatalogue(env: Bindings, providerIds: string[]) {
  return readCatalog(env.DB, "", providerIds);
}

export async function searchCatalogue(env: Bindings, query: string, providerIds: string[]) {
  const catalogue = await readCatalog(env.DB, query, providerIds);
  const items = catalogue?.sections[0]?.items ?? [];
  let pending: MediaTitle[] = [];

  try {
    pending = await findPendingTitles(env, query, items);
  } catch (error) {
    logError("pending_lookup_failed", error, { area: "search" });
  }

  return {
    items: [...items, ...pending],
    query,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCatalogueItems(db: D1Database, ids: string[]) {
  return {
    items: await readItems(db, ids),
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getProviderCatalogue(db: D1Database) {
  return readProviders(db);
}

export async function getTitleAvailability(db: D1Database, titleId: string) {
  const providers = await readAvailability(db, titleId);

  return providers
    ? {
        providers,
        source: "Marquee catalogue",
        fetchedAt: new Date().toISOString(),
      }
    : null;
}

export type BrowseQuery = {
  mediaType?: "movie" | "tv";
  genres: string[];
  providerIds: string[];
  query: string;
  sort: "popularity" | "score" | "recent";
  page: number;
};

const PAGE_SIZE = 24;
const BROWSE_MIN_VOTES = 20;

export async function browseCatalogue(env: Bindings, browse: BrowseQuery) {
  const items = await queryCatalogue(env.DB, {
    mediaType: browse.mediaType,
    genres: browse.genres,
    providerIds: browse.providerIds,
    query: browse.query,
    sort: browse.sort,
    minVotes: browse.sort === "recent" ? 0 : BROWSE_MIN_VOTES,
    limit: PAGE_SIZE + 1,
    offset: browse.page * PAGE_SIZE,
  });

  return {
    items: items.slice(0, PAGE_SIZE),
    hasMore: items.length > PAGE_SIZE,
    page: browse.page,
  };
}

export async function getGenres(env: Bindings) {
  return readGenres(env.DB);
}

export async function getKeywords(env: Bindings) {
  return readKeywords(env.DB);
}

export async function getTonight(env: Bindings, viewerId: string | null) {
  return { episodes: await readTonight(env, viewerId), fetchedAt: new Date().toISOString() };
}

export async function getTrending(env: Bindings) {
  const titleIds = await readTrending(env);

  return {
    items: await readRanked(env.DB, titleIds),
    source: "Wikipedia pageview trend",
    fetchedAt: new Date().toISOString(),
  };
}
