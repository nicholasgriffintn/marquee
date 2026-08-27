import { Hono } from "hono";

import { UPSTREAM_AGENT } from "../clients/fetch.ts";
import { logError, logRejection } from "../lib/logging.ts";
import {
  isRevivalId,
  readReelTarget,
  readStillSource,
  recordPlay,
} from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";

export const reelRoutes = new Hono<{ Bindings: Bindings }>();

const REEL_CACHE = "public, max-age=604800";
const MAX_RANGE_BYTES = 24 * 1_024 * 1_024;

type ParsedRange = { offset: number; length: number };

function parseRange(header: string | undefined, size: number): ParsedRange | null | "invalid" {
  if (!header) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());

  if (!match) {
    return "invalid";
  }

  const [, rawStart, rawEnd] = match;

  if (!rawStart && !rawEnd) {
    return "invalid";
  }

  if (!rawStart) {
    const suffix = Math.min(Number(rawEnd), size);

    return suffix > 0 ? { offset: size - suffix, length: suffix } : "invalid";
  }

  const start = Number(rawStart);

  if (start >= size) {
    return "invalid";
  }

  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

  if (end < start) {
    return "invalid";
  }

  return { offset: start, length: Math.min(end - start + 1, MAX_RANGE_BYTES) };
}

function reelHeaders(contentType: string, etag?: string) {
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": REEL_CACHE,
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  });

  if (etag) {
    headers.set("etag", etag);
  }

  return headers;
}

async function serveFromMirror(
  env: Bindings,
  key: string,
  contentType: string,
  range: string | undefined,
) {
  const head = await env.MEDIA.head(key);

  if (!head) {
    return null;
  }

  const parsed = parseRange(range, head.size);

  if (parsed === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${head.size}`, "accept-ranges": "bytes" },
    });
  }

  const object = await env.MEDIA.get(key, parsed ? { range: parsed } : undefined);

  if (!object) {
    return null;
  }

  const headers = reelHeaders(object.httpMetadata?.contentType ?? contentType, object.httpEtag);

  if (!parsed) {
    headers.set("content-length", String(head.size));

    return new Response(object.body, { status: 200, headers });
  }

  headers.set("content-length", String(parsed.length));
  headers.set(
    "content-range",
    `bytes ${parsed.offset}-${parsed.offset + parsed.length - 1}/${head.size}`,
  );

  return new Response(object.body, { status: 206, headers });
}

async function serveFromSource(url: string, contentType: string, range: string | undefined) {
  const upstream = await fetch(url, {
    redirect: "follow",
    headers: range ? { range, "user-agent": UPSTREAM_AGENT } : { "user-agent": UPSTREAM_AGENT },
    signal: AbortSignal.timeout(30_000),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return null;
  }

  const headers = reelHeaders(upstream.headers.get("content-type") ?? contentType);

  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

const STILL_CACHE = "public, max-age=2592000";
const STILL_WIDTH = 780;

reelRoutes.get("/still/:workId", async (context) => {
  const workId = decodeURIComponent(context.req.param("workId"));

  if (!isRevivalId(workId)) {
    return context.json({ error: "Not found" }, 404);
  }

  const source = await readStillSource(context.env.DB, workId);

  if (!source) {
    return context.json({ error: "Not found" }, 404);
  }

  try {
    const upstream = await fetch(source, {
      redirect: "follow",
      headers: { "user-agent": UPSTREAM_AGENT },
      signal: AbortSignal.timeout(12_000),
      cf: { cacheEverything: true, cacheTtl: 2_592_000 },
    });

    if (!upstream.ok || !upstream.body) {
      return context.json({ error: "Not found" }, 404);
    }

    if (!context.env.IMAGES) {
      return new Response(upstream.body, {
        headers: {
          "cache-control": STILL_CACHE,
          "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
          "x-content-type-options": "nosniff",
        },
      });
    }

    const result = await context.env.IMAGES.input(upstream.body)
      .transform({ width: STILL_WIDTH, fit: "scale-down" })
      .output({ format: "image/webp", quality: 82 });

    const response = result.response();

    return new Response(response.body, {
      headers: {
        "cache-control": STILL_CACHE,
        "content-type": "image/webp",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    logError("reel_still_failed", error, { area: "revival", workId });

    return context.json({ error: "Not found" }, 404);
  }
});

reelRoutes.get("/:workId", async (context) => {
  const workId = decodeURIComponent(context.req.param("workId"));

  if (!isRevivalId(workId)) {
    return context.json({ error: "Not found" }, 404);
  }

  const target = await readReelTarget(context.env.DB, workId);

  if (!target) {
    return context.json({ error: "Not found" }, 404);
  }

  const range = context.req.header("range");

  if (!range) {
    context.executionCtx.waitUntil(
      logRejection(recordPlay(context.env.DB, workId), "reel_play_record_failed", { workId }),
    );
  }

  try {
    if (target.mirrorState === "mirrored" && target.mirrorKey) {
      const mirrored = await serveFromMirror(
        context.env,
        target.mirrorKey,
        target.streamType,
        range,
      );

      if (mirrored) {
        return mirrored;
      }
    }

    const proxied = await serveFromSource(target.streamUrl, target.streamType, range);

    return proxied ?? context.json({ error: "The print is missing a reel" }, 502);
  } catch (error) {
    logError("reel_stream_failed", error, { area: "revival", workId });

    return context.json({ error: "The projector jammed" }, 502);
  }
});
