import { Hono } from "hono";

import { canonicalOrigin } from "../lib/security.ts";
import { feedViewerFor } from "../repositories/feeds.ts";
import { buildAlertFeed, buildDiaryCalendar } from "../services/feeds.ts";
import { readViewerAccess } from "../services/viewer/access.ts";
import type { Bindings } from "../types.ts";

export const feedRoutes = new Hono<{ Bindings: Bindings }>();

const CACHE = "private, max-age=900";
const METHODS = ["GET", "HEAD"];

function notFound() {
  return new Response("No such feed.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=UTF-8" },
  });
}

function served(body: string, contentType: string) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": CACHE,
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}

feedRoutes.on(METHODS, "/:token/diary.ics", async (context) => {
  const viewerId = await feedViewerFor(context.env.DB, context.req.param("token"));

  if (!viewerId) {
    return notFound();
  }

  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const access = await readViewerAccess(context.env.DB, viewerId);
  const calendar = await buildDiaryCalendar(context.env, viewerId, origin, access);

  return served(calendar, "text/calendar; charset=UTF-8");
});

feedRoutes.on(METHODS, "/:token/alerts.atom", async (context) => {
  const token = context.req.param("token");
  const viewerId = await feedViewerFor(context.env.DB, token);

  if (!viewerId) {
    return notFound();
  }

  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const access = await readViewerAccess(context.env.DB, viewerId);
  const feed = await buildAlertFeed(
    context.env,
    viewerId,
    origin,
    `${origin}/feeds/${token}/alerts.atom`,
    access,
  );

  return served(feed, "application/atom+xml; charset=UTF-8");
});
