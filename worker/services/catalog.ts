import type { MediaTitle, TitleBuzz } from "../../src/domain/catalog.ts";
import { readCachedValue, writeCachedValue } from "../lib/cache.ts";
import { logError } from "../lib/logging.ts";
import {
  readAvailability,
  readCatalog,
  readItems,
  readTitlesByMalId,
} from "../repositories/catalog-reader.ts";
import {
  browseTrending,
  readGenres,
  readFilmingPlaces,
  readKeywords,
  readRanked,
  searchCatalogue as queryCatalogue,
  searchTitlesFirst,
} from "../repositories/catalog-search.ts";
import { readProviders } from "../repositories/providers.ts";
import type { Bindings } from "../types.ts";
import { applyBuzz, readBuzz, readTrendingBuzz } from "./buzz.ts";
import { findPendingTitles } from "./discovery.ts";
import { retrieveTitles } from "./retrieval.ts";
import { readNextEpisode, readTonight } from "./schedule.ts";
import { traktUpcoming } from "./trakt.ts";
import { meetsAvailability } from "./viewer/eligibility.ts";

const HYBRID_SEARCH_LIMIT = 24;

async function readBuzzFor(db: D1Database, ids: string[]) {
  try {
    return await readBuzz(db, ids);
  } catch (error) {
    logError("buzz_read_failed", error, { area: "buzz" });

    return new Map<string, TitleBuzz>();
  }
}

async function withBuzz<Item extends MediaTitle>(db: D1Database, items: Item[]) {
  return applyBuzz(
    items,
    await readBuzzFor(
      db,
      items.map((item) => item.id),
    ),
  );
}

export async function getCatalogue(env: Bindings, providerIds: string[]) {
  const catalogue = await readCatalog(env.DB, "", providerIds);

  if (!catalogue) {
    return catalogue;
  }

  const buzz = await readBuzzFor(
    env.DB,
    catalogue.sections.flatMap((section) => section.items.map((item) => item.id)),
  );

  return {
    ...catalogue,
    sections: catalogue.sections.map((section) => {
      section.items = applyBuzz(section.items, buzz);

      return section;
    }),
  };
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
    items: [...(await withBuzz(env.DB, items)), ...pending],
    query,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function searchCatalogueHybrid(env: Bindings, query: string, providerIds: string[]) {
  const items = (await retrieveTitles(env, { text: query, limit: HYBRID_SEARCH_LIMIT })).filter(
    (title) => meetsAvailability(title, providerIds, "confirmed-or-unknown"),
  );

  return {
    items: await withBuzz(env.DB, items),
    query,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCatalogueItems(db: D1Database, ids: string[]) {
  return {
    items: await withBuzz(db, await readItems(db, ids)),
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getAnimeWatchOrder(db: D1Database, titleId: string) {
  const [title] = await readItems(db, [titleId]);
  const relations = title?.anime?.relations ?? [];

  if (relations.length === 0) {
    return {
      related: [],
      source: "MyAnimeList",
      fetchedAt: new Date().toISOString(),
    };
  }

  const found = await readTitlesByMalId(
    db,
    relations.map((relation) => relation.malId),
  );
  const related = relations.flatMap((relation) => {
    const item = found.get(relation.malId);

    return item && item.id !== titleId ? [{ relation: relation.relation, item }] : [];
  });

  const withCounts = await withBuzz(
    db,
    related.map((entry) => entry.item),
  );

  return {
    related: related.map((entry, index) => ({
      relation: entry.relation,
      item: withCounts[index] ?? entry.item,
    })),
    source: "MyAnimeList",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getAnimeRecommendations(db: D1Database, titleId: string) {
  const [title] = await readItems(db, [titleId]);
  const malIds = title?.anime?.recommendations ?? [];

  if (malIds.length === 0) {
    return {
      items: [],
      source: "MyAnimeList",
      fetchedAt: new Date().toISOString(),
    };
  }

  const found = await readTitlesByMalId(db, malIds);
  const items = malIds.flatMap((malId) => {
    const item = found.get(malId);

    return item && item.id !== titleId ? [item] : [];
  });

  return {
    items: await withBuzz(db, items),
    source: "MyAnimeList",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getProviderCatalogue(db: D1Database) {
  return readProviders(db);
}

export async function getTitleAvailability(env: Bindings, titleId: string) {
  const availability = await readAvailability(env.DB, titleId);

  if (!availability) {
    return null;
  }

  const nextEpisode = titleId.startsWith("tv:")
    ? await readNextEpisode(env, titleId).catch(() => null)
    : null;

  return {
    providers: availability.providers,
    checked: availability.checked,
    nextEpisode,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export type BrowseQuery = {
  mediaType?: "movie" | "tv";
  genres: string[];
  keywords: string[];
  places: string[];
  providerIds: string[];
  query: string;
  sort: "trending" | "popularity" | "score" | "recent";
  page: number;
};

const PAGE_SIZE = 24;
const BROWSE_MIN_VOTES = 20;

async function browseByPopularityOrScore(env: Bindings, browse: BrowseQuery, minVotes: number) {
  const search = {
    mediaType: browse.mediaType,
    genres: browse.genres,
    keywords: browse.keywords,
    places: browse.places,
    providerIds: browse.providerIds,
    query: browse.query,
    sort: browse.query && browse.sort === "popularity" ? undefined : browse.sort,
    minVotes,
    limit: PAGE_SIZE + 1,
    offset: browse.page * PAGE_SIZE,
  };

  return browse.query ? searchTitlesFirst(env.DB, search) : queryCatalogue(env.DB, search);
}

function isNarrowed(browse: BrowseQuery) {
  return (
    browse.genres.length > 0 ||
    browse.keywords.length > 0 ||
    browse.places.length > 0 ||
    browse.providerIds.length > 0
  );
}

async function pendingForBrowse(
  env: Bindings,
  browse: BrowseQuery,
  found: MediaTitle[],
  hasMore: boolean,
) {
  if (!browse.query || browse.page > 0 || hasMore || isNarrowed(browse)) {
    return [];
  }

  try {
    const pending = await findPendingTitles(env, browse.query, found);

    return browse.mediaType
      ? pending.filter((title) => title.mediaType === browse.mediaType)
      : pending;
  } catch (error) {
    logError("pending_lookup_failed", error, { area: "browse" });

    return [];
  }
}

export async function browseCatalogue(env: Bindings, browse: BrowseQuery) {
  const minVotes = browse.sort === "recent" ? 0 : BROWSE_MIN_VOTES;
  const items =
    !browse.query && browse.sort === "trending"
      ? await browseTrending(
          env.DB,
          {
            mediaType: browse.mediaType,
            genres: browse.genres,
            keywords: browse.keywords,
            places: browse.places,
            providerIds: browse.providerIds,
            minVotes,
          },
          PAGE_SIZE + 1,
          browse.page * PAGE_SIZE,
        )
      : await browseByPopularityOrScore(env, browse, minVotes);

  const hasMore = items.length > PAGE_SIZE;
  const found = await withBuzz(env.DB, items.slice(0, PAGE_SIZE));

  return {
    items: [...found, ...(await pendingForBrowse(env, browse, found, hasMore))],
    hasMore,
    page: browse.page,
  };
}

const FACET_CACHE_SECONDS = 3_600;

export async function getGenres(env: Bindings, limit: number) {
  const cacheKey = `catalog-genres:${limit}`;
  const cached = await readCachedValue<string[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const genres = await readGenres(env.DB, limit);

  await writeCachedValue(cacheKey, genres, FACET_CACHE_SECONDS);

  return genres;
}

export async function getKeywords(env: Bindings, limit: number) {
  const cacheKey = `catalog-keywords:${limit}`;
  const cached = await readCachedValue<string[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const keywords = await readKeywords(env.DB, limit);

  await writeCachedValue(cacheKey, keywords, FACET_CACHE_SECONDS);

  return keywords;
}

export async function getTonight(
  env: Bindings,
  viewerId: string | null,
  origin: string,
  limit: number,
) {
  const scheduled = await readTonight(env, viewerId, limit);

  if (!viewerId) {
    return { episodes: scheduled, fetchedAt: new Date().toISOString() };
  }

  const seen = new Set(
    scheduled.map((episode) => `${episode.showName}|${episode.airsAt.slice(0, 10)}`),
  );
  const calendar = await traktUpcoming(env, viewerId, origin);
  const extra = calendar
    .filter((episode) => !seen.has(`${episode.showName}|${episode.airsAt.slice(0, 10)}`))
    .map((episode) => ({
      titleId: episode.tmdbId ? `tv:${episode.tmdbId}` : null,
      showName: episode.showName,
      season: episode.season,
      episode: episode.episode,
      episodeName: episode.episodeName,
      airsAt: episode.airsAt,
      network: null,
      item: null,
    }));
  const merged = [...scheduled, ...extra].filter(
    (episode) => Date.parse(episode.airsAt) < Date.now() + 36 * 3_600_000,
  );

  merged.sort((left, right) => Date.parse(left.airsAt) - Date.parse(right.airsAt));
  merged.length = Math.min(merged.length, limit);

  const hydrated = await readRanked(
    env.DB,
    merged.flatMap((episode) => (episode.titleId && !episode.item ? [episode.titleId] : [])),
  );
  const byId = new Map(hydrated.map((item) => [item.id, item]));

  return {
    episodes: merged.map((episode) => {
      episode.item = episode.item ?? (episode.titleId ? (byId.get(episode.titleId) ?? null) : null);

      return episode;
    }),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getTrending(env: Bindings) {
  const ranked = await readTrendingBuzz(env);
  const items = await readRanked(
    env.DB,
    ranked.map((entry) => entry.titleId),
  );
  const byId = new Map(ranked.map((entry) => [entry.titleId, entry.buzz]));

  return {
    items: items.map((item) => {
      item.buzz = byId.get(item.id);

      return item;
    }),
    source: "Wikipedia pageview trend",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getFilmingPlaces(env: Bindings, limit: number) {
  const cacheKey = `catalog-places:${limit}`;
  const cached = await readCachedValue<string[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const places = await readFilmingPlaces(env.DB, limit);

  await writeCachedValue(cacheKey, places, FACET_CACHE_SECONDS);

  return places;
}
