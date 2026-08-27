import { readCappedArrayBuffer, UPSTREAM_AGENT } from "../clients/fetch.ts";
import { getOmdbPoster } from "../clients/omdb.ts";
import { imdbIdFrom } from "../lib/text.ts";
import { claimBudget } from "../repositories/budgets.ts";
import { readRawItems } from "../repositories/catalog-reader.ts";
import { storeEnrichmentMiss, storePoster } from "../repositories/enrichment.ts";
import type { Bindings } from "../types.ts";

const MIN_POSTER_BYTES = 40_000;
const MAX_POSTER_BYTES = 12_000_000;
const FETCH_TIMEOUT_MS = 20_000;

function originPosterUrl(url: string | null | undefined) {
  if (url?.startsWith("https://image.tmdb.org/")) {
    return url.replace(/\/t\/p\/w\d+\//u, "/t/p/w780/");
  }

  if (url?.startsWith("https://m.media-amazon.com/")) {
    return url.replace(/\._V1_.*?(\.\w+)$/u, "._V1_SX1000$1");
  }

  return null;
}

async function fetchImage(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": UPSTREAM_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    return null;
  }

  const body = await readCappedArrayBuffer(response, MAX_POSTER_BYTES);

  return body && body.byteLength > 0 ? { body, contentType } : null;
}

export async function cachePoster(env: Bindings, titleId: string) {
  const title = (await readRawItems(env.DB, [titleId])).get(titleId);
  const imdbId = env.OMDB_API_KEY ? imdbIdFrom(title?.imdbUrl) : null;

  if (imdbId && (await claimBudget(env, "poster"))) {
    const poster = await getOmdbPoster(env, imdbId);

    if (poster && poster.body.byteLength >= MIN_POSTER_BYTES) {
      await storePoster(env, titleId, poster.body, poster.contentType);

      return;
    }
  }

  const tmdbPoster = originPosterUrl(title?.posterUrl);

  if (!tmdbPoster) {
    await storeEnrichmentMiss(env, titleId, "poster", "no-poster-source");

    return;
  }

  const fallback = await fetchImage(tmdbPoster);

  if (!fallback) {
    await storeEnrichmentMiss(env, titleId, "poster", "poster-fetch-failed");

    return;
  }

  await storePoster(env, titleId, fallback.body, fallback.contentType);
}
