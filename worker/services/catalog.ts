import { accessTier, type ViewerAccess } from "../../src/domain/access.ts";
import type { MediaTitle, ProvidersResponse, TitleBuzz } from "../../src/domain/catalog.ts";
import { barredCertifications } from "../../src/domain/certification.ts";
import { getProviderLedger } from "../jobs/provider-ledger.ts";
import { withKvCache, writeKvValue } from "../lib/cache.ts";
import { sha256Hex } from "../lib/hash.ts";
import { logError, logEvent } from "../lib/logging.ts";
import {
  readAnimeRecommendationMap,
  readAnimeRelationMap,
} from "../repositories/catalog-anime-relations.ts";
import {
  readAvailability,
  readCatalog,
  readGatedIds,
  readItems,
  readTitlesByMalId,
} from "../repositories/catalog-reader.ts";
import {
  browseTrending,
  GENRE_LIMIT_MAX,
  KEYWORD_LIMIT_MAX,
  PLACE_LIMIT_MAX,
  readGenres,
  readFilmingPlaces,
  readKeywords,
  readRanked,
  searchCatalogue as queryCatalogue,
  searchTitlesFirst,
} from "../repositories/catalog-search.ts";
import { readProviders, storeProviders } from "../repositories/providers.ts";
import type { Bindings } from "../types.ts";
import { applyBuzz, readBuzz, readTrendingBuzz } from "./buzz.ts";
import { findGapTitles } from "./catalogue-gaps.ts";
import { retrieveTitles } from "./retrieval/index.ts";
import { readNextEpisode, readTonight } from "./schedule.ts";
import { traktUpcoming } from "./trakt.ts";

const HYBRID_SEARCH_LIMIT = 24;
const SEARCH_CACHE_SECONDS = 90;
const TONIGHT_TRAKT_TIMEOUT_MS = 2_000;

async function readBuzzFor(db: Database, ids: string[]) {
  try {
    return await readBuzz(db, ids);
  } catch (error) {
    logError("buzz_read_failed", error, { area: "buzz" });

    return new Map<string, TitleBuzz>();
  }
}

async function withBuzz<Item extends MediaTitle>(db: Database, items: Item[]) {
  return applyBuzz(
    items,
    await readBuzzFor(
      db,
      items.map((item) => item.id),
    ),
  );
}

export async function getCatalogue(env: Bindings, providerIds: string[], access: ViewerAccess) {
  const catalogue = await readCatalog(env.DB, "", providerIds, access);

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

async function searchCacheKey(
  mode: string,
  query: string,
  providerIds: string[],
  access: ViewerAccess,
) {
  const normalised = query.trim().toLowerCase().replaceAll(/\s+/gu, " ");
  const providers = await sha256Hex(providerIds.toSorted().join(","), 8);

  return `search:${mode}:${providers}:${accessTier(access)}:${normalised}`;
}

export async function searchCatalogue(
  env: Bindings,
  query: string,
  providerIds: string[],
  access: ViewerAccess,
  defer?: (task: Promise<unknown>) => void,
) {
  const items = await withKvCache(
    env,
    await searchCacheKey("keyword", query, providerIds, access),
    SEARCH_CACHE_SECONDS,
    async () => (await readCatalog(env.DB, query, providerIds, access))?.sections[0]?.items ?? [],
  );
  let pending: MediaTitle[] = [];

  try {
    pending = await findGapTitles(env, query, items, defer);
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

export async function searchCatalogueHybrid(
  env: Bindings,
  query: string,
  providerIds: string[],
  access: ViewerAccess,
) {
  const items = await withKvCache(
    env,
    await searchCacheKey("hybrid", query, providerIds, access),
    SEARCH_CACHE_SECONDS,
    () =>
      retrieveTitles(env, {
        text: query,
        providerIds,
        availability: "confirmed-or-unknown",
        certifications: barredCertifications(access),
        limit: HYBRID_SEARCH_LIMIT,
      }),
  );

  return {
    items: await withBuzz(env.DB, items),
    query,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCatalogueItems(
  db: Database,
  ids: string[],
  access: ViewerAccess,
  limit = 30,
) {
  const items = await withBuzz(db, await readItems(db, ids, access, limit));
  const found = new Set(items.map((item) => item.id));
  const missing = ids.filter((id) => !found.has(id));
  const gated = access.adult || missing.length === 0 ? [] : await readGatedIds(db, missing);

  return {
    items,
    gated,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getAnimeWatchOrder(db: Database, titleId: string, access: ViewerAccess) {
  const relations = (await readAnimeRelationMap(db, [titleId])).get(titleId) ?? [];

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
    access,
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

export async function getAnimeRecommendations(db: Database, titleId: string, access: ViewerAccess) {
  const malIds = (await readAnimeRecommendationMap(db, [titleId])).get(titleId) ?? [];

  if (malIds.length === 0) {
    return {
      items: [],
      source: "MyAnimeList",
      fetchedAt: new Date().toISOString(),
    };
  }

  const found = await readTitlesByMalId(db, malIds, access);
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

let rebuilding: Promise<ProvidersResponse> | null = null;

export async function getProviderCatalogue(env: Bindings) {
  const stored = await readProviders(env.DB);

  if (stored) {
    return stored;
  }

  rebuilding ??= getProviderLedger(env)
    .then(async (ledger) => {
      await storeProviders(env.DB, ledger);
      logEvent("provider_ledger_rebuilt", {
        providers: ledger.providers.length,
        live: ledger.stats.live,
      });

      return ledger;
    })
    .finally(() => {
      rebuilding = null;
    });

  return rebuilding;
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

async function browseByPopularityOrScore(
  env: Bindings,
  browse: BrowseQuery,
  minVotes: number,
  access: ViewerAccess,
) {
  const search = {
    mediaType: browse.mediaType,
    genres: browse.genres,
    keywords: browse.keywords,
    places: browse.places,
    providerIds: browse.providerIds,
    certifications: barredCertifications(access),
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
    const pending = await findGapTitles(env, browse.query, found);

    return browse.mediaType
      ? pending.filter((title) => title.mediaType === browse.mediaType)
      : pending;
  } catch (error) {
    logError("pending_lookup_failed", error, { area: "browse" });

    return [];
  }
}

export async function browseCatalogue(env: Bindings, browse: BrowseQuery, access: ViewerAccess) {
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
            certifications: barredCertifications(access),
            minVotes,
          },
          PAGE_SIZE + 1,
          browse.page * PAGE_SIZE,
        )
      : await browseByPopularityOrScore(env, browse, minVotes, access);

  const hasMore = items.length > PAGE_SIZE;
  const found = await withBuzz(env.DB, items.slice(0, PAGE_SIZE));

  return {
    items: [...found, ...(await pendingForBrowse(env, browse, found, hasMore))],
    hasMore,
    page: browse.page,
  };
}

const FACET_CACHE_SECONDS = 21_600;
const TRENDING_CACHE_SECONDS = 1_800;

const FACETS = {
  "catalog-genres": { max: GENRE_LIMIT_MAX, read: readGenres },
  "catalog-keywords": { max: KEYWORD_LIMIT_MAX, read: readKeywords },
  "catalog-places": { max: PLACE_LIMIT_MAX, read: readFilmingPlaces },
} as const satisfies Record<
  string,
  { max: number; read: (db: Database, max: number) => Promise<string[]> }
>;

type FacetName = keyof typeof FACETS;

async function readFacet(env: Bindings, name: FacetName, limit: number) {
  const { max, read } = FACETS[name];
  const values = await withKvCache(env, name, FACET_CACHE_SECONDS, () => read(env.DB, max));

  return values.slice(0, limit);
}

export async function warmCatalogFacets(env: Bindings) {
  const names = Object.keys(FACETS) as FacetName[];
  const warmed = await Promise.all(
    names.map(async (name) => {
      const values = await FACETS[name].read(env.DB, FACETS[name].max);

      await writeKvValue(env, name, values, FACET_CACHE_SECONDS);

      return values.length;
    }),
  );

  return Object.fromEntries(names.map((name, index) => [name, warmed[index]]));
}

export function getGenres(env: Bindings, limit: number) {
  return readFacet(env, "catalog-genres", limit);
}

export function getKeywords(env: Bindings, limit: number) {
  return readFacet(env, "catalog-keywords", limit);
}

export async function getTonight(
  env: Bindings,
  viewerId: string | null,
  origin: string,
  limit: number,
  access: ViewerAccess,
) {
  const [scheduled, calendar] = await Promise.all([
    readTonight(env, viewerId, limit, access),
    viewerId ? traktUpcoming(env, viewerId, origin, TONIGHT_TRAKT_TIMEOUT_MS) : [],
  ]);

  if (!viewerId) {
    return { episodes: scheduled, fetchedAt: new Date().toISOString() };
  }

  const seen = new Set(
    scheduled.map((episode) => `${episode.showName}|${episode.airsAt.slice(0, 10)}`),
  );
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
    access,
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

async function buildTrending(env: Bindings, access: ViewerAccess) {
  const ranked = await readTrendingBuzz(env);
  const items = await readRanked(
    env.DB,
    ranked.map((entry) => entry.titleId),
    access,
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

export function getTrending(env: Bindings, access: ViewerAccess) {
  return withKvCache(env, `catalog-trending:${accessTier(access)}`, TRENDING_CACHE_SECONDS, () =>
    buildTrending(env, access),
  );
}

export function getFilmingPlaces(env: Bindings, limit: number) {
  return readFacet(env, "catalog-places", limit);
}
