import { Hono } from "hono";

import { sessionPrincipal } from "../auth/session.ts";
import { edgeCache } from "../lib/cache.ts";
import { recordEvent } from "../lib/events.ts";
import { clientRateLimitKey } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { validProviderIds } from "../lib/validation.ts";
import {
  browseCatalogue,
  getCatalogue,
  getGenres,
  getKeywords,
  searchCatalogue,
  getCatalogueItems,
  getProviderCatalogue,
  getTitleAvailability,
} from "../services/catalog.ts";
import type { Bindings } from "../types.ts";

export const catalogRoutes = new Hono<{ Bindings: Bindings }>();

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

catalogRoutes.get("/search", async (context) => {
  const query = (context.req.query("query") ?? "").trim().slice(0, 120);
  const providerIds = validProviderIds((context.req.query("providers") ?? "").split(","));

  if (!query) {
    return context.json({ items: [], query: "", source: "Marquee catalogue", fetchedAt: "" });
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);
  const limiter = principal
    ? context.env.SEARCH_MEMBER_RATE_LIMITER
    : context.env.SEARCH_RATE_LIMITER;
  const { success } = await limiter.limit({
    key: clientRateLimitKey(context.req.raw, principal?.user.id ?? "anonymous"),
  });

  if (!success) {
    return context.json({ error: "Too many searches. Try again in a minute." }, 429);
  }

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
  try {
    context.header("cache-control", "public, max-age=3600");

    return context.json({ genres: await getGenres(context.env) });
  } catch (error) {
    logError("genres_read_failed", error, { area: "browse" });

    return context.json({ genres: [] });
  }
});

catalogRoutes.get("/keywords", edgeCache(3_600), async (context) => {
  try {
    return context.json({ keywords: await getKeywords(context.env) });
  } catch (error) {
    logError("keywords_read_failed", error, { area: "browse" });

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
        providerIds: validProviderIds((context.req.query("providers") ?? "").split(",")),
        query: (context.req.query("query") ?? "").trim().slice(0, 120),
        sort: sortParam === "score" || sortParam === "recent" ? sortParam : "popularity",
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

catalogRoutes.get("/:mediaType/:tmdbId/availability", edgeCache(900), async (context) => {
  const mediaType = context.req.param("mediaType");
  const tmdbId = Number(context.req.param("tmdbId"));

  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isInteger(tmdbId) || tmdbId < 1) {
    return context.json({ error: "Unknown title" }, 404);
  }

  try {
    const availability = await getTitleAvailability(context.env.DB, `${mediaType}:${tmdbId}`);

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
