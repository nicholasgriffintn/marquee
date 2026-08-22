import { Hono } from "hono";

import { logError } from "../lib/logging.ts";
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

    return result.response({
      headers: {
        "cache-control": IMMUTABLE,
        vary: "accept",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    logError("poster_transform_failed", error, { area: "media" });

    const original = await context.env.MEDIA.get(key);

    return original ? rawResponse(original) : context.json({ error: "Not found" }, 404);
  }
});
