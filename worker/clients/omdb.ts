import type { MediaType } from "../../src/domain/catalog.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings, TitleRatings } from "../types.ts";

const API_BASE = "https://www.omdbapi.com/";
const POSTER_BASE = "https://img.omdbapi.com/";
const POSTER_HEIGHT = 1_000;

export class OmdbError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "OmdbError";
  }
}

function ratingValue(payload: Record<string, unknown>, source: string) {
  const ratings = Array.isArray(payload.Ratings) ? payload.Ratings : [];
  const match = ratings.find(
    (entry) => isRecord(entry) && entry.Source === source && typeof entry.Value === "string",
  );

  return isRecord(match) && typeof match.Value === "string" ? match.Value : null;
}

function numeric(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.replaceAll(",", ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown) {
  return typeof value === "string" ? numeric(value.replace(/^[^\d]*/u, "")) : null;
}

function awardWins(value: unknown) {
  if (typeof value !== "string" || value === "N/A") {
    return { awards: null, awardWins: null };
  }

  const wins = /(\d+)\s+wins?/iu.exec(value);
  const won = /won\s+(\d+)/iu.exec(value);
  const total = Number(wins?.[1] ?? won?.[1] ?? 0);

  return { awards: value.slice(0, 200), awardWins: Number.isFinite(total) ? total : null };
}

export async function getOmdbRatings(env: Bindings, imdbId: string): Promise<TitleRatings> {
  if (!env.OMDB_API_KEY) {
    throw new OmdbError("OMDb is not configured", 503);
  }

  const url = new URL(API_BASE);

  url.search = new URLSearchParams({
    apikey: env.OMDB_API_KEY,
    i: imdbId,
    tomatoes: "true",
  }).toString();

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

  if (!response.ok) {
    throw new OmdbError(`OMDb request failed (${response.status})`);
  }

  const payload = await response.json();

  if (!isRecord(payload)) {
    throw new OmdbError("OMDb returned an invalid payload");
  }

  if (payload.Response === "False") {
    const error = typeof payload.Error === "string" ? payload.Error : "OMDb has no record";

    if (error.toLowerCase().includes("limit")) {
      throw new OmdbError("OMDb daily limit reached", 429);
    }

    return { imdbScore: null, imdbVotes: null, rottenTomatoes: null, metascore: null };
  }

  return {
    imdbScore: numeric(payload.imdbRating),
    imdbVotes: numeric(payload.imdbVotes),
    rottenTomatoes: ratingValue(payload, "Rotten Tomatoes"),
    metascore: numeric(payload.Metascore),
    boxOffice: money(payload.BoxOffice),
    ...awardWins(payload.Awards),
  };
}

export async function getOmdbPoster(env: Bindings, imdbId: string, height = POSTER_HEIGHT) {
  if (!env.OMDB_API_KEY) {
    throw new OmdbError("OMDb is not configured", 503);
  }

  const url = new URL(POSTER_BASE);

  url.search = new URLSearchParams({
    apikey: env.OMDB_API_KEY,
    i: imdbId,
    h: String(height),
  }).toString();

  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new OmdbError(`OMDb poster request failed (${response.status})`, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    return null;
  }

  const body = await response.arrayBuffer();

  return body.byteLength > 0 ? { body, contentType } : null;
}

export type OmdbSearchResult = {
  imdbId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  posterUrl: string | null;
};

export async function searchOmdb(env: Bindings, query: string, page = 1) {
  if (!env.OMDB_API_KEY) {
    return [];
  }

  const url = new URL(API_BASE);

  url.search = new URLSearchParams({
    apikey: env.OMDB_API_KEY,
    s: query,
    page: String(page),
  }).toString();

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    cf: { cacheEverything: true, cacheTtl: 3_600 },
  });

  if (!response.ok) {
    throw new OmdbError(`OMDb search failed (${response.status})`, response.status);
  }

  const payload = await response.json();

  if (!isRecord(payload) || !Array.isArray(payload.Search)) {
    return [];
  }

  return payload.Search.flatMap((entry): OmdbSearchResult[] => {
    if (!isRecord(entry) || typeof entry.imdbID !== "string") {
      return [];
    }

    if (!/^tt\d+$/u.test(entry.imdbID) || typeof entry.Title !== "string") {
      return [];
    }

    const year = typeof entry.Year === "string" ? Number(entry.Year.slice(0, 4)) : Number.NaN;
    const poster =
      typeof entry.Poster === "string" && entry.Poster.startsWith("https://") ? entry.Poster : null;

    return [
      {
        imdbId: entry.imdbID,
        title: entry.Title,
        year: Number.isInteger(year) ? year : null,
        mediaType: entry.Type === "series" ? "tv" : "movie",
        posterUrl: poster,
      },
    ];
  });
}
