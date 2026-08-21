import type { MediaType } from "../../src/domain/catalog.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings, TraktStats } from "../types.ts";

const API_BASE = "https://api.trakt.tv";

export class TraktError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TraktError";
  }
}

async function requestTrakt(env: Bindings, path: string) {
  if (!env.TRAKT_CLIENT_ID) {
    throw new TraktError("Trakt is not configured", 503);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": env.TRAKT_CLIENT_ID,
    },
    signal: AbortSignal.timeout(12_000),
    cf: { cacheEverything: true, cacheTtl: 21_600 },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new TraktError(`Trakt request failed (${response.status})`, response.status);
  }

  return response.json();
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

export async function getTraktStats(
  env: Bindings,
  mediaType: MediaType,
  tmdbId: number,
): Promise<TraktStats | null> {
  const type = mediaType === "movie" ? "movie" : "show";
  const found = await requestTrakt(env, `/search/tmdb/${tmdbId}?type=${type}`);

  if (!Array.isArray(found) || found.length === 0) {
    return null;
  }

  const [first] = found;
  const entity = isRecord(first) && isRecord(first[type]) ? first[type] : null;
  const ids = entity && isRecord(entity.ids) ? entity.ids : null;
  const slug = ids && typeof ids.slug === "string" ? ids.slug : null;

  if (!slug) {
    return null;
  }

  const collection = type === "movie" ? "movies" : "shows";
  const [stats, ratings] = await Promise.all([
    requestTrakt(env, `/${collection}/${slug}/stats`),
    requestTrakt(env, `/${collection}/${slug}/ratings`),
  ]);

  return {
    slug,
    traktId: ids && integer(ids.trakt) !== null ? integer(ids.trakt) : null,
    imdbId: ids && typeof ids.imdb === "string" ? ids.imdb : null,
    watchers: isRecord(stats) ? integer(stats.watchers) : null,
    plays: isRecord(stats) ? integer(stats.plays) : null,
    collectors: isRecord(stats) ? integer(stats.collectors) : null,
    rating:
      isRecord(ratings) && typeof ratings.rating === "number" && Number.isFinite(ratings.rating)
        ? ratings.rating
        : null,
    votes: isRecord(ratings) ? integer(ratings.votes) : null,
  };
}
