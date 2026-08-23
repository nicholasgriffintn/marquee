import { Hono } from "hono";

import { sessionPrincipal } from "../auth/session.ts";
import { edgeCache } from "../lib/cache.ts";
import { readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import {
  isRevivalId,
  readWorksForTitle,
  saveProgress,
  searchApproved,
} from "../repositories/revival.ts";
import { getProgramme, getScreening } from "../services/revival.ts";
import type { Bindings } from "../types.ts";

export const revivalRoutes = new Hono<{ Bindings: Bindings }>();

revivalRoutes.get("/", async (context) => {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  try {
    context.header("cache-control", principal ? "no-store" : "public, max-age=300");

    return context.json(await getProgramme(context.env, principal?.user.id ?? null));
  } catch (error) {
    logError("revival_programme_failed", error, { area: "revival" });

    return context.json({ shelves: [], total: 0, fetchedAt: "" });
  }
});

revivalRoutes.get("/search", async (context) => {
  const query = (context.req.query("q") ?? "").trim().slice(0, 80);

  if (query.length < 2) {
    return context.json({ works: [], query });
  }

  try {
    context.header("cache-control", "public, max-age=300");

    return context.json({ works: await searchApproved(context.env.DB, query), query });
  } catch (error) {
    logError("revival_search_failed", error, { area: "revival" });

    return context.json({ works: [], query });
  }
});

revivalRoutes.get("/titles/:mediaType/:tmdbId", edgeCache(900), async (context) => {
  const titleId = `${context.req.param("mediaType")}:${context.req.param("tmdbId")}`;

  if (!isKnownTitle(titleId)) {
    return context.json({ works: [] });
  }

  try {
    context.header("cache-control", "public, max-age=900");

    return context.json({ works: await readWorksForTitle(context.env.DB, titleId) });
  } catch (error) {
    logError("revival_title_failed", error, { area: "revival", titleId });

    return context.json({ works: [] });
  }
});

revivalRoutes.get("/:workId", async (context) => {
  const workId = context.req.param("workId");

  if (!isRevivalId(workId)) {
    return context.json({ error: "Nothing showing under that name" }, 404);
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);

  try {
    context.header("cache-control", "no-store");

    const screening = await getScreening(context.env, workId, principal?.user.id ?? null);

    return screening
      ? context.json(screening)
      : context.json({ error: "Nothing showing under that name" }, 404);
  } catch (error) {
    logError("revival_screening_failed", error, { area: "revival", workId });

    return context.json({ error: "That screen is dark" }, 500);
  }
});

revivalRoutes.post("/:workId/progress", async (context) => {
  const workId = context.req.param("workId");
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return context.json({ error: "Sign in to keep your place" }, 401);
  }

  if (!isRevivalId(workId)) {
    return context.json({ error: "Nothing showing under that name" }, 404);
  }

  const body = await readJsonObject(context.req.raw);
  const position = Number(body?.positionSeconds);

  if (!Number.isFinite(position) || position < 0) {
    return context.json({ error: "That is not a position" }, 400);
  }

  try {
    await saveProgress(
      context.env.DB,
      principal.user.id,
      workId,
      Math.min(position, 86_400),
      body?.finished === true,
    );

    return context.json({ ok: true });
  } catch (error) {
    logError("revival_progress_failed", error, { area: "revival", workId });

    return context.json({ error: "Could not keep your place" }, 500);
  }
});
