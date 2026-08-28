import { Hono } from "hono";

import { canonicalOrigin } from "../lib/security.ts";
import { cardFor, NOINDEX_PATHS } from "../lib/share.ts";
import type { Bindings } from "../types.ts";

export const pageMetadataRoutes = new Hono<{ Bindings: Bindings }>();

const PATH_LIMIT = 2048;

pageMetadataRoutes.get("/", async (context) => {
  const requested = context.req.query("path") ?? "/";

  if (requested.length > PATH_LIMIT || !requested.startsWith("/")) {
    return context.json({ error: "That is not a path on this site." }, 400);
  }

  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  let url: URL;

  try {
    url = new URL(requested, origin);
  } catch {
    return context.json({ error: "That is not a path on this site." }, 400);
  }

  if (url.origin !== origin) {
    return context.json({ error: "That is not a path on this site." }, 400);
  }

  const card = await cardFor(context.env, url, origin).catch(() => null);

  context.header("cache-control", "public, max-age=300");

  if (!card) {
    return context.json({
      canonical: `${origin}${url.pathname}`,
      index: !NOINDEX_PATHS.has(url.pathname),
      title: null,
      description: null,
      image: null,
      ogType: null,
      structuredData: [],
    });
  }

  return context.json(card);
});
