import { Hono } from "hono";

import { NO_AWARDS } from "../../src/domain/awards.ts";
import { NO_RAILS } from "../../src/domain/rails.ts";
import { requireAuthentication, sessionPrincipal, type AuthVariables } from "../auth/session.ts";
import { refreshTitleAvailability } from "../jobs/availability.ts";
import { edgeCache } from "../lib/cache.ts";
import { recordEvent } from "../lib/events.ts";
import { edgeOrigin } from "../lib/geo.ts";
import { mintJourney, ticketSection, ticketSections } from "../lib/journeys.ts";
import { logError } from "../lib/logging.ts";
import { pathInteger, queryInteger, queryList, queryText } from "../lib/params.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { readPersonAwards, readTitleAwards } from "../repositories/awards.ts";
import {
  listCollections,
  readCollectionTitleIds,
  readItems,
} from "../repositories/catalog-reader.ts";
import {
  GENRE_LIMIT_MAX,
  KEYWORD_LIMIT_MAX,
  PLACE_LIMIT_MAX,
} from "../repositories/catalog-search.ts";
import {
  listPeople,
  readCreditSeasons,
  readPerson,
  readPersonShelf,
  readPersonTitleIds,
  readTitleCredits,
} from "../repositories/people.ts";
import { readPlacesForTitle } from "../repositories/title-places.ts";
import { getTitleAdaptations } from "../services/adaptations.ts";
import {
  browseCatalogue,
  getCatalogue,
  getGenres,
  getFilmingPlaces,
  getKeywords,
  getTonight,
  getTrending,
  searchCatalogue,
  searchCatalogueHybrid,
  getAnimeRecommendations,
  getAnimeWatchOrder,
  getCatalogueItems,
  getProviderCatalogue,
  getTitleAvailability,
} from "../services/catalog.ts";
import { getFeaturedTitle } from "../services/featured.ts";
import { deliverRails } from "../services/rail-delivery.ts";
import { getSeason, getSeasonIndex } from "../services/seasons.ts";
import type { Bindings } from "../types.ts";

const TONIGHT_DEFAULT_LIMIT = 12;
const QUERY_LIMIT = 120;
const PROVIDER_LIMIT = 500;
const FACET_LIMIT = 6;
const ITEMS_LIMIT = 30;
const MAX_BROWSE_PAGE = 80;
const KEYWORDS_DEFAULT_LIMIT = 120;
const PLACES_DEFAULT_LIMIT = 80;
const GENRES_DEFAULT_LIMIT = 40;
const SEASON_LIMIT = 100;
const RAILS_CACHE_SECONDS = 120;
const MAX_TMDB_ID = 9_999_999_999;

export const catalogRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

catalogRoutes.get("/", edgeCache(900), async (context) => {
  const providerIds = validProviderIds(queryList(context, "providers", PROVIDER_LIMIT));

  try {
    const catalogue = await getCatalogue(context.env, providerIds);

    if (!catalogue) {
      return context.json({ error: "Catalogue not found" }, 404);
    }

    context.header("cache-control", "public, max-age=900");

    return context.json({
      ...catalogue,
      sections: await ticketSections(context.env, catalogue.sections, "catalogue"),
    });
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "catalogue" });

    return context.json({ error: "Catalogue is unavailable" }, 500);
  }
});

catalogRoutes.get("/rails", requireAuthentication, async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const startedAt = Date.now();
    const delivery = await deliverRails(context.env, {
      viewerId: user.id,
      origin: edgeOrigin(context.req.raw),
      generate: context.req.query("generate") === "1",
    });
    const rails = await Promise.all(
      delivery.rails.map((rail) =>
        ticketSection(context.env, rail, rail.source === "ai" ? "ai-rail" : "rail"),
      ),
    );

    context.header(
      "cache-control",
      delivery.status === "ready" ? `private, max-age=${RAILS_CACHE_SECONDS}` : "no-store",
    );

    recordEvent(context.env, {
      name: "rails_served",
      viewerId: user.id,
      mode: "rail",
      value: rails.length,
      latencyMs: Date.now() - startedAt,
      detail: `${delivery.generationId}:${delivery.status}`,
    });

    return context.json({ ...delivery, rails });
  } catch (error) {
    logError("rails_delivery_failed", error, { area: "catalogue" });
    context.header("cache-control", "no-store");

    return context.json({ ...NO_RAILS, status: "error" });
  }
});

catalogRoutes.get("/featured", async (context) => {
  const providerIds = validProviderIds(queryList(context, "providers", PROVIDER_LIMIT));
  const principal = await sessionPrincipal(context.env, context.req.raw);

  try {
    context.header("cache-control", "private, max-age=300");

    return context.json(
      await getFeaturedTitle(context.env, {
        viewerId: principal?.user.id ?? null,
        providerIds,
        origin: edgeOrigin(context.req.raw),
      }),
    );
  } catch (error) {
    logError("featured_title_failed", error, { area: "catalogue" });
    context.header("cache-control", "no-store");

    return context.json({ item: null, source: null, fetchedAt: "" });
  }
});

catalogRoutes.get("/search", async (context) => {
  const query = queryText(context, "query", QUERY_LIMIT);
  const providerIds = validProviderIds(queryList(context, "providers", PROVIDER_LIMIT));
  const hybrid = context.req.query("mode") === "hybrid";

  if (!query) {
    return context.json({
      items: [],
      query: "",
      source: "Marquee catalogue",
      fetchedAt: "",
    });
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);

  try {
    context.header("cache-control", "no-store");

    const startedAt = Date.now();
    const results = hybrid
      ? await searchCatalogueHybrid(context.env, query, providerIds)
      : await searchCatalogue(context.env, query, providerIds);
    const journey = await mintJourney(context.env, {
      mode: "search",
      angle: hybrid ? "search_hybrid" : "search_keyword",
      size: results.items.length,
    });

    recordEvent(context.env, {
      name: "search",
      viewerId: principal?.user.id,
      detail: query,
      value: results.items.length,
      journeyId: journey.id,
      mode: "search",
      source: hybrid ? "search_hybrid" : "search_keyword",
      latencyMs: Date.now() - startedAt,
    });

    return context.json({ ...results, journey: journey.token });
  } catch (error) {
    logError("catalogue_search_failed", error, { area: "search" });

    return context.json({ error: "Search is unavailable" }, 500);
  }
});

catalogRoutes.get("/genres", edgeCache(3_600), async (context) => {
  const limit = queryInteger(context, "limit", GENRES_DEFAULT_LIMIT, 1, GENRE_LIMIT_MAX);

  try {
    context.header("cache-control", "public, max-age=3600");

    return context.json({ genres: await getGenres(context.env, limit) });
  } catch (error) {
    logError("genres_read_failed", error, { area: "browse" });
    context.header("cache-control", "no-store");

    return context.json({ genres: [] });
  }
});

catalogRoutes.get("/tonight", async (context) => {
  const principal = await sessionPrincipal(context.env, context.req.raw);
  const limit = queryInteger(context, "limit", TONIGHT_DEFAULT_LIMIT, 1, 40);

  try {
    context.header("cache-control", "no-store");

    return context.json(
      await getTonight(
        context.env,
        principal?.user.id ?? null,
        canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
        limit,
      ),
    );
  } catch (error) {
    logError("tonight_read_failed", error, { area: "schedule" });

    return context.json({ episodes: [], fetchedAt: "" });
  }
});

catalogRoutes.get("/trending", edgeCache(1_800), async (context) => {
  try {
    return context.json(await getTrending(context.env));
  } catch (error) {
    logError("trending_read_failed", error, { area: "buzz" });
    context.header("cache-control", "no-store");

    return context.json({
      items: [],
      source: "Wikipedia pageview trend",
      fetchedAt: "",
    });
  }
});

catalogRoutes.get("/places", edgeCache(3_600), async (context) => {
  const limit = queryInteger(context, "limit", PLACES_DEFAULT_LIMIT, 1, PLACE_LIMIT_MAX);

  try {
    return context.json({ places: await getFilmingPlaces(context.env, limit) });
  } catch (error) {
    logError("places_read_failed", error, { area: "browse" });
    context.header("cache-control", "no-store");

    return context.json({ places: [] });
  }
});

catalogRoutes.get("/keywords", edgeCache(3_600), async (context) => {
  const limit = queryInteger(context, "limit", KEYWORDS_DEFAULT_LIMIT, 1, KEYWORD_LIMIT_MAX);

  try {
    return context.json({ keywords: await getKeywords(context.env, limit) });
  } catch (error) {
    logError("keywords_read_failed", error, { area: "browse" });
    context.header("cache-control", "no-store");

    return context.json({ keywords: [] });
  }
});

catalogRoutes.get("/browse", edgeCache(120), async (context) => {
  const mediaTypeParam = context.req.query("mediaType");
  const sortParam = context.req.query("sort");

  try {
    context.header("cache-control", "public, max-age=120");

    return context.json(
      await browseCatalogue(context.env, {
        mediaType:
          mediaTypeParam === "movie" || mediaTypeParam === "tv" ? mediaTypeParam : undefined,
        genres: queryList(context, "genres", FACET_LIMIT),
        keywords: queryList(context, "keywords", FACET_LIMIT),
        places: queryList(context, "places", FACET_LIMIT),
        providerIds: validProviderIds(queryList(context, "providers", PROVIDER_LIMIT)),
        query: queryText(context, "query", QUERY_LIMIT),
        sort:
          sortParam === "score" || sortParam === "recent" || sortParam === "trending"
            ? sortParam
            : "popularity",
        page: queryInteger(context, "page", 0, 0, MAX_BROWSE_PAGE),
      }),
    );
  } catch (error) {
    logError("browse_failed", error, { area: "browse" });

    return context.json({ error: "Browsing is unavailable" }, 500);
  }
});

catalogRoutes.get("/items", edgeCache(900), async (context) => {
  const ids = queryList(context, "ids", ITEMS_LIMIT);

  try {
    context.header("cache-control", "public, max-age=900");

    return context.json(await getCatalogueItems(context.env.DB, ids));
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "items" });

    return context.json({ error: "Catalogue items are unavailable" }, 500);
  }
});

const PERSON_LIMIT = 48;
const COLLECTION_LIMIT = 24;
const DIRECTORY_LIMIT = 60;
const MAX_PERSON_PAGE = 200;
const MAX_COLLECTION_PAGE = 200;
const MAX_DIRECTORY_PAGE = 200;

catalogRoutes.get("/people", edgeCache(3_600), async (context) => {
  const query = queryText(context, "query", QUERY_LIMIT);
  const page = queryInteger(context, "page", 0, 0, MAX_DIRECTORY_PAGE);

  try {
    const people = await listPeople(
      context.env.DB,
      query,
      DIRECTORY_LIMIT + 1,
      page * DIRECTORY_LIMIT,
    );

    context.header("cache-control", "public, max-age=3600");

    return context.json({
      items: people.slice(0, DIRECTORY_LIMIT),
      page,
      hasMore: people.length > DIRECTORY_LIMIT,
    });
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "people" });

    return context.json({ error: "The book of names is out of reach" }, 500);
  }
});

catalogRoutes.get("/collections", edgeCache(3_600), async (context) => {
  const query = queryText(context, "query", QUERY_LIMIT);
  const page = queryInteger(context, "page", 0, 0, MAX_DIRECTORY_PAGE);

  try {
    const collections = await listCollections(
      context.env.DB,
      query,
      DIRECTORY_LIMIT + 1,
      page * DIRECTORY_LIMIT,
    );

    context.header("cache-control", "public, max-age=3600");

    return context.json({
      items: collections.slice(0, DIRECTORY_LIMIT),
      page,
      hasMore: collections.length > DIRECTORY_LIMIT,
    });
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "collections" });

    return context.json({ error: "The collections are out of reach" }, 500);
  }
});

catalogRoutes.get("/people/:id", async (context) => {
  const identifier = decodeURIComponent(context.req.param("id")).slice(0, 120);
  const page = queryInteger(context, "page", 0, 0, MAX_PERSON_PAGE);

  try {
    const person = await readPerson(context.env.DB, identifier);

    if (!person) {
      return context.json({ error: "No one here by that name" }, 404);
    }

    const principal = await sessionPrincipal(context.env, context.req.raw);
    const [ids, shelf, awards] = await Promise.all([
      readPersonTitleIds(context.env.DB, person.personId, PERSON_LIMIT + 1, page * PERSON_LIMIT),
      principal?.user
        ? readPersonShelf(context.env.DB, principal.user.id, person.personId)
        : Promise.resolve({ shelved: 0, watched: 0 }),
      readPersonAwards(context.env.DB, person.personId),
    ]);
    const hasMore = ids.length > PERSON_LIMIT;
    const items = await readItems(context.env.DB, ids.slice(0, PERSON_LIMIT), PERSON_LIMIT);

    return context.json({ person, items, shelf, awards, page, hasMore });
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "person" });

    return context.json({ error: "That name is out of reach" }, 500);
  }
});

catalogRoutes.get("/collections/:id", edgeCache(3_600), async (context) => {
  const collectionId = pathInteger(context, "id", 1, MAX_TMDB_ID);

  if (collectionId === null) {
    return context.json({ error: "Unknown collection" }, 404);
  }

  const page = queryInteger(context, "page", 0, 0, MAX_COLLECTION_PAGE);

  try {
    const ids = await readCollectionTitleIds(
      context.env.DB,
      collectionId,
      COLLECTION_LIMIT + 1,
      page * COLLECTION_LIMIT,
    );
    const hasMore = ids.length > COLLECTION_LIMIT;
    const items = await readItems(context.env.DB, ids.slice(0, COLLECTION_LIMIT), COLLECTION_LIMIT);

    context.header("cache-control", "public, max-age=3600");

    return context.json({ items, hasMore, page });
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "collection" });

    return context.json({ error: "That collection is out of reach" }, 500);
  }
});

catalogRoutes.get("/providers", edgeCache(300), async (context) => {
  try {
    const providers = await getProviderCatalogue(context.env.DB);

    if (!providers) {
      return context.json({ error: "Provider catalogue is warming up" }, 503);
    }

    context.header("cache-control", "public, max-age=300, stale-while-revalidate=21600");

    return context.json(providers);
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "providers" });

    return context.json({ error: "Provider catalogue is unavailable" }, 500);
  }
});

const CREDIT_PAGE = 40;

function creditNumber(raw: string | undefined) {
  const value = Number(raw);

  return raw !== undefined && Number.isInteger(value) && value >= 0 && value <= 10_000
    ? value
    : null;
}

function sortBySeason(left: { season: number }, right: { season: number }) {
  return left.season - right.season;
}

catalogRoutes.get("/titles/:titleId/credits", edgeCache(3_600), async (context) => {
  const titleId = context.req.param("titleId");
  const empty = { cast: [], crew: [], seasons: [], total: 0, hasMore: false };

  if (!isKnownTitle(titleId)) {
    return context.json(empty);
  }

  const page = creditNumber(context.req.query("page")) ?? 1;
  const scope = {
    season: creditNumber(context.req.query("season")),
    episode: creditNumber(context.req.query("episode")),
  };

  try {
    if (titleId.startsWith("tv:") && scope.season !== null) {
      await getSeason(context.env, titleId, scope.season);
    }

    const [credits, creditSeasons, seasonIndex] = await Promise.all([
      readTitleCredits(
        context.env.DB,
        titleId,
        scope,
        CREDIT_PAGE,
        Math.max(0, page - 1) * CREDIT_PAGE,
      ),
      readCreditSeasons(context.env.DB, titleId),
      titleId.startsWith("tv:") ? getSeasonIndex(context.env, titleId) : null,
    ]);
    const known = new Set(creditSeasons.map((entry) => entry.season));
    const merged = [
      ...creditSeasons,
      ...(seasonIndex?.seasons
        .filter((entry) => !known.has(entry.seasonNumber))
        .map((entry) => ({
          season: entry.seasonNumber,
          credits: 0,
          episodes: 0,
        })) ?? []),
    ];
    // The project targets ES2022, before Array.prototype.toSorted.
    // oxlint-disable-next-line unicorn/no-array-sort
    const seasons = seasonIndex ? merged.sort(sortBySeason) : creditSeasons;

    return context.json({ ...credits, page, seasons });
  } catch (error) {
    logError("title_credits_failed", error, { area: "catalogue", titleId });

    return context.json(empty);
  }
});

catalogRoutes.get("/titles/:titleId/awards", edgeCache(3_600), async (context) => {
  const titleId = context.req.param("titleId");

  if (!isKnownTitle(titleId)) {
    return context.json(NO_AWARDS);
  }

  return context.json(await readTitleAwards(context.env.DB, titleId));
});

catalogRoutes.get("/titles/:titleId/places", edgeCache(3_600), async (context) => {
  const titleId = context.req.param("titleId");
  const empty = { filming: [], narrative: [] };

  if (!isKnownTitle(titleId)) {
    return context.json(empty);
  }

  try {
    return context.json(await readPlacesForTitle(context.env.DB, titleId));
  } catch (error) {
    logError("title_places_read_failed", error, {
      area: "catalogue",
      titleId,
    });

    return context.json(empty);
  }
});

catalogRoutes.get("/titles/:titleId/watch-order", edgeCache(3_600), async (context) => {
  const titleId = context.req.param("titleId");

  try {
    return context.json(await getAnimeWatchOrder(context.env.DB, titleId));
  } catch (error) {
    logError("watch_order_read_failed", error, { area: "anime" });

    return context.json({ related: [] });
  }
});

catalogRoutes.get("/titles/:titleId/anime-recommendations", edgeCache(3_600), async (context) => {
  const titleId = context.req.param("titleId");

  try {
    return context.json(await getAnimeRecommendations(context.env.DB, titleId));
  } catch (error) {
    logError("anime_recommendations_read_failed", error, { area: "anime" });

    return context.json({ items: [] });
  }
});

catalogRoutes.get("/titles/:titleId/adaptations", edgeCache(3_600), async (context) => {
  const titleId = context.req.param("titleId");

  try {
    return context.json(await getTitleAdaptations(context.env.DB, titleId));
  } catch (error) {
    logError("adaptations_read_failed", error, { area: "adaptations" });

    return context.json({ source: null, items: [] });
  }
});

catalogRoutes.get("/tv/:tmdbId/seasons", edgeCache(3_600), async (context) => {
  const tmdbId = pathInteger(context, "tmdbId", 1, MAX_TMDB_ID);

  if (tmdbId === null) {
    return context.json({ error: "Unknown series" }, 404);
  }

  try {
    const index = await getSeasonIndex(context.env, `tv:${tmdbId}`);

    context.header("cache-control", "public, max-age=3600");

    return context.json({ ...index, fetchedAt: new Date().toISOString() });
  } catch (error) {
    logError("season_index_read_failed", error, { area: "seasons" });

    return context.json({ error: "The series listing is unavailable" }, 500);
  }
});

catalogRoutes.get("/tv/:tmdbId/seasons/:seasonNumber", edgeCache(3_600), async (context) => {
  const tmdbId = pathInteger(context, "tmdbId", 1, MAX_TMDB_ID);
  const seasonNumber = pathInteger(context, "seasonNumber", 0, SEASON_LIMIT);

  if (tmdbId === null || seasonNumber === null) {
    return context.json({ error: "Unknown season" }, 404);
  }

  try {
    const season = await getSeason(context.env, `tv:${tmdbId}`, seasonNumber);

    if (!season) {
      return context.json({ error: "Unknown season" }, 404);
    }

    context.header("cache-control", "public, max-age=3600");

    return context.json(season);
  } catch (error) {
    logError("season_read_failed", error, { area: "seasons" });

    return context.json({ error: "That season is unavailable" }, 500);
  }
});

catalogRoutes.get("/:mediaType/:tmdbId/availability", edgeCache(900), async (context) => {
  const mediaType = context.req.param("mediaType");
  const tmdbId = pathInteger(context, "tmdbId", 1, MAX_TMDB_ID);

  if ((mediaType !== "movie" && mediaType !== "tv") || tmdbId === null) {
    return context.json({ error: "Unknown title" }, 404);
  }

  try {
    const availability = await getTitleAvailability(context.env, `${mediaType}:${tmdbId}`);

    if (!availability) {
      return context.json({ error: "Unknown title" }, 404);
    }

    recordEvent(context.env, {
      name: "title_view",
      titleId: `${mediaType}:${tmdbId}`,
    });

    context.header("cache-control", "public, max-age=900");

    return context.json(availability);
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "availability" });

    return context.json({ error: "Availability is unavailable" }, 500);
  }
});

catalogRoutes.post("/:mediaType/:tmdbId/availability/refresh", async (context) => {
  const mediaType = context.req.param("mediaType");
  const tmdbId = pathInteger(context, "tmdbId", 1, MAX_TMDB_ID);

  if ((mediaType !== "movie" && mediaType !== "tv") || tmdbId === null) {
    return context.json({ error: "Unknown title" }, 404);
  }

  try {
    const availability = await refreshTitleAvailability(context.env, `${mediaType}:${tmdbId}`);

    if (!availability) {
      return context.json({ error: "Unknown title" }, 404);
    }

    return context.json(availability);
  } catch (error) {
    logError("catalogue_refresh_failed", error, { area: "availability" });

    return context.json({ error: "Availability is unavailable" }, 500);
  }
});
