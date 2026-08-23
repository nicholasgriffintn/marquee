import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { edgeOrigin } from "../lib/geo.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import {
  clampRadius,
  getLocalShowings,
  getNearbyCinemas,
  getTitleShowings,
  rememberInterest,
} from "../services/cinema.ts";
import type { Bindings } from "../types.ts";

export const cinemaRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

/**
 * Everything here is signed-in only. The position never leaves the edge request
 * and is never written against an account, but a viewer who has not chosen to be
 * here should not have the building looking up where they are at all.
 */
cinemaRoutes.use("*", requireAuthentication);

cinemaRoutes.get("/near", async (context) => {
  const origin = edgeOrigin(context.req.raw);
  const radiusKm = clampRadius(context.req.query("radius"));

  try {
    context.executionCtx.waitUntil(rememberInterest(context.env, origin));

    return context.json(await getNearbyCinemas(context.env, origin, radiusKm));
  } catch (error) {
    logError("cinema_near_failed", error, { area: "cinema" });

    return context.json({ cinemas: [], origin: null, radiusKm, fetchedAt: "" });
  }
});

cinemaRoutes.get("/showing", async (context) => {
  const origin = edgeOrigin(context.req.raw);
  const radiusKm = clampRadius(context.req.query("radius"));

  try {
    context.executionCtx.waitUntil(rememberInterest(context.env, origin));

    return context.json(await getLocalShowings(context.env, origin, radiusKm));
  } catch (error) {
    logError("cinema_showing_failed", error, { area: "cinema" });

    return context.json({ items: [], cinemas: [], origin: null, radiusKm, fetchedAt: "" });
  }
});

cinemaRoutes.get("/titles/:mediaType/:tmdbId", async (context) => {
  const titleId = `${context.req.param("mediaType")}:${context.req.param("tmdbId")}`;
  const radiusKm = clampRadius(context.req.query("radius"));

  if (!isKnownTitle(titleId)) {
    return context.json({ error: "Unknown title" }, 404);
  }

  try {
    const origin = edgeOrigin(context.req.raw);

    context.executionCtx.waitUntil(rememberInterest(context.env, origin));

    return context.json(await getTitleShowings(context.env, titleId, origin, radiusKm));
  } catch (error) {
    logError("cinema_title_failed", error, { area: "cinema" });

    return context.json({ listings: [], origin: null, radiusKm, fetchedAt: "" });
  }
});
