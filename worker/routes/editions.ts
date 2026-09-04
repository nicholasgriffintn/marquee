import { Hono } from "hono";

import { edgeCache } from "../lib/cache.ts";
import { logError } from "../lib/logging.ts";
import { listEditions, readEdition } from "../services/edition.ts";
import type { Bindings } from "../types.ts";

export const editionRoutes = new Hono<{ Bindings: Bindings }>();

const CACHE = "public, max-age=600";

editionRoutes.get("/", edgeCache(600), async (context) => {
  try {
    context.header("cache-control", CACHE);

    return context.json({ editions: await listEditions(context.env) });
  } catch (error) {
    logError("edition_list_failed", error, { area: "edition" });

    return context.json({ editions: [] });
  }
});

editionRoutes.get("/:weekOf", edgeCache(600), async (context) => {
  const requested = context.req.param("weekOf");

  try {
    const issue = await readEdition(context.env, requested === "latest" ? undefined : requested);

    if (!issue) {
      return context.json({ error: "No programme for that week." }, 404);
    }

    context.header("cache-control", CACHE);

    return context.json(issue);
  } catch (error) {
    logError("edition_read_failed", error, { area: "edition", weekOf: requested });

    return context.json({ error: "The programme is unavailable." }, 500);
  }
});
