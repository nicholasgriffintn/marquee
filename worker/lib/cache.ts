import type { MiddlewareHandler } from "hono";

import type { Bindings } from "../types.ts";

const edgeCaches = caches as unknown as { default: Cache };

const CACHE_VERSION = "2";

function versionedKey(url: string) {
  const key = new URL(url);

  key.searchParams.set("cache-version", CACHE_VERSION);

  return new Request(key, { method: "GET" });
}

export function edgeCache(seconds: number): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (context, next) => {
    if (context.req.method !== "GET") {
      return next();
    }

    const cache = edgeCaches.default;
    const cacheKey = versionedKey(context.req.url);
    const hit = await cache.match(cacheKey);

    if (hit) {
      const response = new Response(hit.body, hit);

      response.headers.set("x-marquee-cache", "hit");

      return response;
    }

    await next();

    const response = context.res;

    if (response.status !== 200 || response.headers.get("cache-control")?.includes("no-store")) {
      return response;
    }

    const stored = new Response(response.clone().body, response);

    stored.headers.set("cache-control", `public, max-age=${seconds}`);
    context.executionCtx.waitUntil(cache.put(cacheKey, stored));

    return response;
  };
}
