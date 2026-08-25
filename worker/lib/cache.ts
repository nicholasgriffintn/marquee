import type { MiddlewareHandler } from "hono";

import type { Bindings } from "../types.ts";

const edgeCaches = caches as unknown as { default: Cache };

const CACHE_VERSION = "2";

function versionedKey(url: string) {
  const key = new URL(url);

  key.searchParams.set("cache-version", CACHE_VERSION);

  return new Request(key, { method: "GET" });
}

function namedKey(key: string) {
  return versionedKey(`https://cache.marquee.internal/${encodeURIComponent(key)}`);
}

export async function readCachedValue<T>(key: string): Promise<T | null> {
  const hit = await edgeCaches.default.match(namedKey(key));

  return hit ? ((await hit.json()) as T) : null;
}

export async function writeCachedValue(key: string, value: unknown, seconds: number) {
  await edgeCaches.default.put(
    namedKey(key),
    new Response(JSON.stringify(value), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${seconds}`,
      },
    }),
  );
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
