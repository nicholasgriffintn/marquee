import { clamp } from "../lib/numbers.ts";
import { isRecord, numberAt, recordAt, records, stringAt } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const API_BASE = "https://api.trakt.tv";
const API_VERSION = "2";
const TOKEN_TIMEOUT_MS = 12_000;
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 20_000;

function traktHeaders(env: Bindings, accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    "trakt-api-version": API_VERSION,
    "trakt-api-key": env.TRAKT_CLIENT_ID ?? "",
  };
}

export const TraktError = upstreamError("TraktError");

export type TraktTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export type TraktEntry = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  imdbId: string | null;
  plays: number;
  rating: number | null;
  lastWatchedAt: string | null;
};

export type TraktEpisode = {
  imdbId: string | null;
  tmdbId: number | null;
  showName: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  airsAt: string;
};

function assertConfigured(env: Bindings) {
  if (!env.TRAKT_CLIENT_ID || !env.TRAKT_CLIENT_SECRET) {
    throw new TraktError("Trakt is not configured", 503);
  }
}

export function traktAuthorizeUrl(env: Bindings, redirectUri: string, state: string) {
  assertConfigured(env);

  const url = new URL("https://trakt.tv/oauth/authorize");

  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.TRAKT_CLIENT_ID as string,
    redirect_uri: redirectUri,
    state,
  }).toString();

  return url;
}

function parseTokens(payload: unknown): TraktTokens {
  if (!isRecord(payload) || typeof payload.access_token !== "string") {
    throw new TraktError("Trakt returned an unusable token response");
  }

  const expiresIn = numberAt(payload, "expires_in");

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1_000).toISOString() : null,
  };
}

async function requestToken(env: Bindings, body: Record<string, string>) {
  assertConfigured(env);

  const response = await upstreamFetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...body,
      client_id: env.TRAKT_CLIENT_ID,
      client_secret: env.TRAKT_CLIENT_SECRET,
    }),
    timeoutMs: TOKEN_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new TraktError(`Trakt token exchange failed (${response.status})`, response.status);
  }

  return parseTokens(await response.json());
}

export function exchangeTraktCode(env: Bindings, code: string, redirectUri: string) {
  return requestToken(env, { code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export function refreshTraktTokens(env: Bindings, refreshToken: string, redirectUri: string) {
  return requestToken(env, {
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
    grant_type: "refresh_token",
  });
}

async function requestTrakt(env: Bindings, path: string, accessToken: string) {
  assertConfigured(env);

  const response = await upstreamFetch(`${API_BASE}${path}`, {
    headers: traktHeaders(env, accessToken),
    timeoutMs: READ_TIMEOUT_MS,
  });

  if (response.status === 401) {
    throw new TraktError("Trakt authorisation expired", 401);
  }

  if (!response.ok) {
    throw new TraktError(`Trakt request failed (${response.status})`, response.status);
  }

  return response.json();
}

export type TraktPushItem = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  watchedAt?: string;
  rating?: number;
};

function pushEntry(item: TraktPushItem) {
  return {
    ids: { tmdb: item.tmdbId },
    ...(item.watchedAt ? { watched_at: item.watchedAt } : {}),
    ...(item.rating ? { rating: item.rating } : {}),
  };
}

function pushBody(items: TraktPushItem[]) {
  return {
    movies: items.filter((item) => item.mediaType === "movie").map(pushEntry),
    shows: items.filter((item) => item.mediaType === "tv").map(pushEntry),
  };
}

async function postTrakt(env: Bindings, path: string, accessToken: string, body: unknown) {
  assertConfigured(env);

  const response = await upstreamFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...traktHeaders(env, accessToken), "content-type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: WRITE_TIMEOUT_MS,
  });

  if (response.status === 401) {
    throw new TraktError("Trakt authorisation expired", 401);
  }

  if (!response.ok) {
    throw new TraktError(`Trakt write failed (${response.status})`, response.status);
  }

  return response.json();
}

function addedCount(payload: unknown) {
  const added = isRecord(payload) && isRecord(payload.added) ? payload.added : null;

  if (!added) {
    return 0;
  }

  return (
    (numberAt(added, "movies") ?? 0) +
    (numberAt(added, "shows") ?? 0) +
    (numberAt(added, "episodes") ?? 0)
  );
}

export async function pushTraktHistory(env: Bindings, accessToken: string, items: TraktPushItem[]) {
  if (items.length === 0) {
    return 0;
  }

  return addedCount(await postTrakt(env, "/sync/history", accessToken, pushBody(items)));
}

export async function pushTraktRatings(env: Bindings, accessToken: string, items: TraktPushItem[]) {
  if (items.length === 0) {
    return 0;
  }

  return addedCount(await postTrakt(env, "/sync/ratings", accessToken, pushBody(items)));
}

export async function pushTraktWatchlist(
  env: Bindings,
  accessToken: string,
  items: TraktPushItem[],
) {
  if (items.length === 0) {
    return 0;
  }

  return addedCount(await postTrakt(env, "/sync/watchlist", accessToken, pushBody(items)));
}

function idsOf(container: Record<string, unknown> | null) {
  const ids = container && isRecord(container.ids) ? container.ids : null;

  return {
    tmdbId: ids ? numberAt(ids, "tmdb") : null,
    imdbId: ids ? stringAt(ids, "imdb") : null,
  };
}

function parseEntries(payload: unknown, mediaType: "movie" | "tv"): TraktEntry[] {
  const key = mediaType === "movie" ? "movie" : "show";

  return records(payload).flatMap((item): TraktEntry[] => {
    const container = recordAt(item, key);
    const { tmdbId, imdbId } = idsOf(container);

    if (!tmdbId) {
      return [];
    }

    const rating = numberAt(item, "rating");

    return [
      {
        tmdbId,
        mediaType,
        imdbId,
        plays: numberAt(item, "plays") ?? 0,
        rating: rating && rating >= 1 && rating <= 10 ? rating : null,
        lastWatchedAt: stringAt(item, "last_watched_at") ?? stringAt(item, "rated_at"),
      },
    ];
  });
}

export async function getTraktWatched(env: Bindings, accessToken: string) {
  const [movies, shows] = await Promise.all([
    requestTrakt(env, "/sync/watched/movies", accessToken),
    requestTrakt(env, "/sync/watched/shows", accessToken),
  ]);

  return [...parseEntries(movies, "movie"), ...parseEntries(shows, "tv")];
}

export async function getTraktRatings(env: Bindings, accessToken: string) {
  const [movies, shows] = await Promise.all([
    requestTrakt(env, "/sync/ratings/movies", accessToken),
    requestTrakt(env, "/sync/ratings/shows", accessToken),
  ]);

  return [...parseEntries(movies, "movie"), ...parseEntries(shows, "tv")];
}

export async function getTraktWatchlist(env: Bindings, accessToken: string) {
  const [movies, shows] = await Promise.all([
    requestTrakt(env, "/sync/watchlist/movies", accessToken),
    requestTrakt(env, "/sync/watchlist/shows", accessToken),
  ]);

  return [...parseEntries(movies, "movie"), ...parseEntries(shows, "tv")];
}

export async function getTraktCalendar(env: Bindings, accessToken: string, days = 7) {
  const start = new Date().toISOString().slice(0, 10);
  const payload = await requestTrakt(
    env,
    `/calendars/my/shows/${start}/${clamp(days, 1, 33)}`,
    accessToken,
  );

  return records(payload).flatMap((item): TraktEpisode[] => {
    const show = recordAt(item, "show");
    const episode = recordAt(item, "episode");
    const airsAt = stringAt(item, "first_aired");
    const showName = show ? stringAt(show, "title") : null;

    if (!airsAt || !showName) {
      return [];
    }

    const { tmdbId, imdbId } = idsOf(show);

    return [
      {
        imdbId,
        tmdbId,
        showName,
        season: episode ? numberAt(episode, "season") : null,
        episode: episode ? numberAt(episode, "number") : null,
        episodeName: episode ? stringAt(episode, "title") : null,
        airsAt,
      },
    ];
  });
}

export async function getTraktUser(env: Bindings, accessToken: string) {
  const payload = await requestTrakt(env, "/users/me", accessToken);

  return isRecord(payload) ? (stringAt(payload, "username") ?? stringAt(payload, "name")) : null;
}
