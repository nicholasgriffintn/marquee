import { Hono } from "hono";

import { UPSTREAM_AGENT } from "../clients/fetch.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";

export const mediaRoutes = new Hono<{ Bindings: Bindings }>();

const POSTER_WIDTHS = new Set([160, 320, 500, 780]);
const IMMUTABLE = "public, max-age=31536000, immutable";

function bestFormat(accept: string) {
  if (accept.includes("image/avif")) {
    return "image/avif" as const;
  }

  return accept.includes("image/webp") ? ("image/webp" as const) : ("image/jpeg" as const);
}

function withHeaders(response: Response, extra: Record<string, string>) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(extra)) {
    headers.set(name, value);
  }

  return new Response(response.body, { status: response.status, headers });
}

function rawResponse(object: R2ObjectBody) {
  return new Response(object.body, {
    headers: {
      "cache-control": IMMUTABLE,
      "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}

mediaRoutes.get("/posters/:file", async (context) => {
  const file = context.req.param("file");

  if (!/^[\w-]{1,80}$/u.test(file)) {
    return context.json({ error: "Not found" }, 404);
  }

  const key = `posters/${file}`;
  const object = await context.env.MEDIA.get(key);

  if (!object) {
    return context.json({ error: "Not found" }, 404);
  }

  const requested = Number(context.req.query("w") ?? "0");
  const width = POSTER_WIDTHS.has(requested) ? requested : 0;

  if (!width || !context.env.IMAGES) {
    return rawResponse(object);
  }

  const format = bestFormat(context.req.header("accept") ?? "");

  try {
    const result = await context.env.IMAGES.input(object.body)
      .transform({ width, fit: "scale-down" })
      .output({ format, quality: 82 });

    return withHeaders(result.response(), {
      "cache-control": IMMUTABLE,
      vary: "accept",
      "x-content-type-options": "nosniff",
    });
  } catch (error) {
    logError("poster_transform_failed", error, { area: "media" });

    const original = await context.env.MEDIA.get(key);

    return original ? rawResponse(original) : context.json({ error: "Not found" }, 404);
  }
});

const OG_WIDTH = 1_200;
const OG_HEIGHT = 630;

mediaRoutes.get("/og/:titleId", async (context) => {
  const titleId = decodeURIComponent(context.req.param("titleId")).replace(/\.png$/u, "");

  if (!isKnownTitle(titleId) || !context.env.IMAGES) {
    return context.json({ error: "Not found" }, 404);
  }

  const [title] = await readItems(context.env.DB, [titleId]);
  const source = title?.backdropUrl ?? title?.posterUrl;

  if (!source) {
    return context.json({ error: "Not found" }, 404);
  }

  try {
    const upstream = source.startsWith("/media/")
      ? await context.env.MEDIA.get(source.replace("/media/", ""))
      : await fetch(source, {
          headers: { "user-agent": UPSTREAM_AGENT },
          cf: { cacheEverything: true, cacheTtl: 86_400 },
        });
    const body = upstream instanceof Response ? upstream.body : (upstream?.body ?? null);

    if (!body) {
      return context.json({ error: "Not found" }, 404);
    }

    const result = await context.env.IMAGES.input(body)
      .transform({ width: OG_WIDTH, height: OG_HEIGHT, fit: "cover" })
      .output({ format: "image/png" });

    return withHeaders(result.response(), {
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    });
  } catch (error) {
    logError("og_image_failed", error, { area: "media", titleId });

    return context.json({ error: "Not found" }, 404);
  }
});
