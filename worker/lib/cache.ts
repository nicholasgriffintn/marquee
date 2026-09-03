import type { MiddlewareHandler } from "hono";

import { accessTier } from "../../src/domain/access.ts";
import { viewerAccess } from "../services/viewer/access.ts";
import type { Bindings } from "../types.ts";
import { logError, logRejection } from "./logging.ts";

const edgeCaches = caches as unknown as { default: Cache };

const CACHE_VERSION = "4";

function versionedKey(url: string, tier = "") {
  const key = new URL(url);

  key.searchParams.set("cache-version", CACHE_VERSION);

  if (tier) {
    key.searchParams.set("access", tier);
  }

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

const KV_VERSION = "1";
const KV_MINIMUM_SECONDS = 60;
const KV_KEY_LIMIT = 512;

function kvKey(key: string) {
  return `v${KV_VERSION}:${key}`;
}

function storable(key: string) {
  return new TextEncoder().encode(key).byteLength <= KV_KEY_LIMIT;
}

export function readKvValue<T>(env: Bindings, key: string, seconds: number): Promise<T | null> {
  return env.CACHE.get<T>(kvKey(key), {
    type: "json",
    cacheTtl: Math.max(seconds, KV_MINIMUM_SECONDS),
  });
}

export async function writeKvValue(env: Bindings, key: string, value: unknown, seconds: number) {
  await env.CACHE.put(kvKey(key), JSON.stringify(value), {
    expirationTtl: Math.max(seconds, KV_MINIMUM_SECONDS),
  });
}

export async function withKvCache<T>(
  env: Bindings,
  key: string,
  seconds: number,
  build: () => Promise<T>,
): Promise<T> {
  if (!storable(kvKey(key))) {
    return build();
  }

  const cached = await readKvValue<T>(env, key, seconds).catch((error: unknown) => {
    logError("kv_cache_read_failed", error, { key });

    return null;
  });

  if (cached !== null) {
    return cached;
  }

  const value = await build();

  if (value !== null && value !== undefined) {
    await logRejection(writeKvValue(env, key, value, seconds), "kv_cache_write_failed", { key });
  }

  return value;
}

export function edgeCache(
  seconds: number,
  options: { byAccess?: boolean } = {},
): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (context, next) => {
    if (context.req.method !== "GET") {
      return next();
    }

    const tier = options.byAccess
      ? accessTier(await viewerAccess(context.env, context.req.raw))
      : "";
    const cache = edgeCaches.default;
    const cacheKey = versionedKey(context.req.url, tier);
    const hit = await cache.match(cacheKey);

    if (hit) {
      const response = new Response(hit.body, hit);

      response.headers.set("x-marquee-cache", "hit");

      if (tier) {
        response.headers.set("cache-control", `private, max-age=${seconds}`);
      }

      return response;
    }

    await next();

    const response = context.res;

    const cacheControl = response.headers.get("cache-control") ?? "";
    const directives = new Set(
      cacheControl.split(",").map((directive) => directive.trim().toLowerCase()),
    );

    if (
      response.status !== 200 ||
      !directives.has("public") ||
      directives.has("private") ||
      directives.has("no-store") ||
      response.headers.has("set-cookie")
    ) {
      return response;
    }

    const stored = new Response(response.clone().body, response);

    stored.headers.set("cache-control", `public, max-age=${seconds}`);
    context.executionCtx.waitUntil(
      logRejection(cache.put(cacheKey, stored), "edge_cache_put_failed", { cacheKey }),
    );

    if (tier) {
      response.headers.set("cache-control", `private, max-age=${seconds}`);
    }

    return response;
  };
}
