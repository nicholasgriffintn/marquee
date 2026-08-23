import { Hono } from "hono";

import { requireAuthentication, sessionPrincipal, type AuthVariables } from "../auth/session.ts";
import { edgeCache } from "../lib/cache.ts";
import { recordEvent } from "../lib/events.ts";
import { edgeOrigin } from "../lib/geo.ts";
import { logError } from "../lib/logging.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { validProviderIds } from "../lib/validation.ts";
import { readCollectionTitleIds, readItems } from "../repositories/catalog-reader.ts";
import { readPerson, readPersonShelf, readPersonTitleIds } from "../repositories/people.ts";
import {
  browseCatalogue,
  getCatalogue,
  getGenres,
  getKeywords,
  getTonight,
  getTrending,
  searchCatalogue,
  getCatalogueItems,
  getProviderCatalogue,
  getTitleAvailability,
} from "../services/catalog.ts";
import { getPersonalRails } from "../services/personal-rails.ts";
import { getSeason, getSeasonIndex } from "../services/seasons.ts";
import type { Bindings } from "../types.ts";

const TONIGHT_DEFAULT_LIMIT = 12;
const KEYWORDS_DEFAULT_LIMIT = 120;
const GENRES_DEFAULT_LIMIT = 40;
const SEASON_LIMIT = 100;

export const catalogRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

catalogRoutes.get("/", edgeCache(900), async (context) => {
  const query = (context.req.query("query") ?? "").trim().slice(0, 120);
  const providerIds = validProviderIds((context.req.query("providers") ?? "").split(","));

  try {
    const catalogue = await getCatalogue(context.env, providerIds);

    if (!catalogue) {
      return context.json({ error: "Catalogue not found" }, 404);
    }

    context.header("cache-control", query ? "public, max-age=60" : "public, max-age=900");

    return context.json(catalogue);
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "catalogue" });

    return context.json({ error: "Catalogue is unavailable" }, 500);
  }
});

catalogRoutes.get("/rails", requireAuthentication, async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const sections = await getPersonalRails(context.env, user.id, edgeOrigin(context.req.raw));

    context.header("cache-control", "private, max-age=120");

    return context.json({ sections });
  } catch (error) {
    logError("personal_rails_failed", error, { area: "catalogue" });

    return context.json({ sections: [] });
  }
});

catalogRoutes.get("/search", async (context) => {
  const query = (context.req.query("query") ?? "").trim().slice(0, 120);
  const providerIds = validProviderIds((context.req.query("providers") ?? "").split(","));

  if (!query) {
    return context.json({ items: [], query: "", source: "Marquee catalogue", fetchedAt: "" });
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);

  try {
    context.header("cache-control", "no-store");

    const results = await searchCatalogue(context.env, query, providerIds);

    recordEvent(context.env, {
      name: "search",
      viewerId: principal?.user.id,
      detail: query,
      value: results.items.length,
    });

    return context.json(results);
  } catch (error) {
    logError("catalogue_search_failed", error, { area: "search" });

    return context.json({ error: "Search is unavailable" }, 500);
  }
});

catalogRoutes.get("/genres", edgeCache(3_600), async (context) => {
  const requestedLimit = Number.parseInt(context.req.query("limit") ?? "", 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(200, requestedLimit))
    : GENRES_DEFAULT_LIMIT;

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
  const requestedLimit = Number.parseInt(context.req.query("limit") ?? "", 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(40, requestedLimit))
    : TONIGHT_DEFAULT_LIMIT;

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

    return context.json({ items: [], source: "Wikipedia pageview trend", fetchedAt: "" });
  }
});

catalogRoutes.get("/keywords", edgeCache(3_600), async (context) => {
  const requestedLimit = Number.parseInt(context.req.query("limit") ?? "", 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(400, requestedLimit))
    : KEYWORDS_DEFAULT_LIMIT;

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
  const page = Number.parseInt(context.req.query("page") ?? "0", 10);

  try {
    context.header("cache-control", "public, max-age=120");

    return context.json(
      await browseCatalogue(context.env, {
        mediaType:
          mediaTypeParam === "movie" || mediaTypeParam === "tv" ? mediaTypeParam : undefined,
        genres: (context.req.query("genres") ?? "")
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean)
          .slice(0, 6),
        keywords: (context.req.query("keywords") ?? "")
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean)
          .slice(0, 6),
        providerIds: validProviderIds((context.req.query("providers") ?? "").split(",")),
        query: (context.req.query("query") ?? "").trim().slice(0, 120),
        sort:
          sortParam === "score" || sortParam === "recent" || sortParam === "trending"
            ? sortParam
            : "popularity",
        page: Number.isInteger(page) && page > 0 ? Math.min(page, 80) : 0,
      }),
    );
  } catch (error) {
    logError("browse_failed", error, { area: "browse" });

    return context.json({ error: "Browsing is unavailable" }, 500);
  }
});

catalogRoutes.get("/items", edgeCache(900), async (context) => {
  const ids = (context.req.query("ids") ?? "").split(",").filter(Boolean).slice(0, 30);

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

catalogRoutes.get("/people/:name", async (context) => {
  const name = decodeURIComponent(context.req.param("name")).slice(0, 120);

  try {
    const person = await readPerson(context.env.DB, name);

    if (!person) {
      return context.json({ error: "No one here by that name" }, 404);
    }

    const principal = await sessionPrincipal(context.env, context.req.raw);
    const [items, shelf] = await Promise.all([
      readPersonTitleIds(context.env.DB, person.name, PERSON_LIMIT).then((ids) =>
        readItems(context.env.DB, ids, PERSON_LIMIT),
      ),
      principal?.user
        ? readPersonShelf(context.env.DB, principal.user.id, person.name)
        : Promise.resolve({ shelved: 0, watched: 0 }),
    ]);

    return context.json({ person, items, shelf });
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "person" });

    return context.json({ error: "That name is out of reach" }, 500);
  }
});

catalogRoutes.get("/collections/:id", edgeCache(3_600), async (context) => {
  const collectionId = Number(context.req.param("id"));

  if (!Number.isInteger(collectionId) || collectionId < 1) {
    return context.json({ error: "Unknown collection" }, 400);
  }

  try {
    const ids = await readCollectionTitleIds(context.env.DB, collectionId, COLLECTION_LIMIT);

    context.header("cache-control", "public, max-age=3600");

    return context.json({ items: await readItems(context.env.DB, ids, COLLECTION_LIMIT) });
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

catalogRoutes.get("/tv/:tmdbId/seasons", edgeCache(3_600), async (context) => {
  const tmdbId = Number(context.req.param("tmdbId"));

  if (!Number.isInteger(tmdbId) || tmdbId < 1) {
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
  const tmdbId = Number(context.req.param("tmdbId"));
  const seasonNumber = Number(context.req.param("seasonNumber"));

  if (!Number.isInteger(tmdbId) || tmdbId < 1 || !Number.isInteger(seasonNumber)) {
    return context.json({ error: "Unknown season" }, 404);
  }

  if (seasonNumber < 0 || seasonNumber > SEASON_LIMIT) {
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
  const tmdbId = Number(context.req.param("tmdbId"));

  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isInteger(tmdbId) || tmdbId < 1) {
    return context.json({ error: "Unknown title" }, 404);
  }

  try {
    const availability = await getTitleAvailability(context.env, `${mediaType}:${tmdbId}`);

    if (!availability) {
      return context.json({ error: "Unknown title" }, 404);
    }

    recordEvent(context.env, { name: "title_view", titleId: `${mediaType}:${tmdbId}` });

    context.header("cache-control", "public, max-age=900");

    return context.json(availability);
  } catch (error) {
    logError("catalogue_read_failed", error, { area: "availability" });

    return context.json({ error: "Availability is unavailable" }, 500);
  }
});
