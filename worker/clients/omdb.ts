import type { MediaType } from "../../src/domain/catalog.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings, TitleRatings } from "../types.ts";
import { readCappedArrayBuffer, upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const POSTER_TIMEOUT_MS = 20_000;
const MAX_POSTER_BYTES = 12_000_000;
const SEARCH_TIMEOUT_MS = 8_000;
const RATINGS_CACHE_TTL = 86_400;
const SEARCH_CACHE_TTL = 3_600;
const SEASON_CACHE_TTL = 604_800;

const API_BASE = "https://www.omdbapi.com/";
const POSTER_BASE = "https://img.omdbapi.com/";
const POSTER_HEIGHT = 1_000;
const PLOT_LIMIT = 1_200;
const LIST_LIMIT = 12;
const PEOPLE_LIMIT = 12;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const UNRATED = new Set(["n/a", "not rated", "unrated", "none", "no rating"]);

const NOT_FOUND_ERRORS = [
  "movie not found",
  "series not found",
  "episode not found",
  "incorrect imdb id",
  "too many results",
];

export const OmdbError = upstreamError("OmdbError");

export type OmdbFacts = {
  certification: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  releaseDate: string | null;
  plot: string | null;
  people: string[];
  studios: string[];
  countries: string[];
  languages: string[];
  numberOfSeasons: number | null;
  posterUrl: string | null;
};

export type OmdbRecord = {
  imdbId: string | null;
  title: string;
  year: number | null;
  mediaType: MediaType;
  omdbType: string;
  ratings: TitleRatings;
  facts: OmdbFacts;
};

export type OmdbLookup =
  | { imdbId: string }
  | { title: string; year?: number | null; mediaType?: MediaType };

export type OmdbEpisode = {
  episodeNumber: number;
  imdbId: string | null;
  imdbScore: number | null;
};

function text(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed && trimmed !== "N/A" ? trimmed : null;
}

function list(value: unknown, limit = LIST_LIMIT) {
  const raw = text(value);

  if (!raw) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry && entry !== "N/A"),
    ),
  ].slice(0, limit);
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

function minutes(value: unknown) {
  const raw = text(value);
  const match = raw ? /(\d+)\s*min/iu.exec(raw) : null;

  return match ? Number(match[1]) : null;
}

function releaseDate(value: unknown) {
  const raw = text(value);
  const match = raw ? /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/u.exec(raw) : null;

  if (!match) {
    return null;
  }

  const month = MONTHS.indexOf((match[2] ?? "").toLowerCase());

  if (month < 0) {
    return null;
  }

  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${(match[1] ?? "").padStart(2, "0")}`;
}

function certification(value: unknown) {
  const raw = text(value);

  return raw && !UNRATED.has(raw.toLowerCase()) ? `US ${raw}` : null;
}

function releaseYear(value: unknown) {
  const raw = text(value);
  const year = raw ? Number(raw.slice(0, 4)) : Number.NaN;

  return Number.isInteger(year) ? year : null;
}

function posterUrl(value: unknown) {
  const raw = text(value);

  return raw?.startsWith("https://") ? raw : null;
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

function omdbFacts(payload: Record<string, unknown>): OmdbFacts {
  const plot = text(payload.Plot);

  return {
    certification: certification(payload.Rated),
    runtimeMinutes: minutes(payload.Runtime),
    genres: list(payload.Genre),
    releaseDate: releaseDate(payload.Released),
    plot: plot ? plot.slice(0, PLOT_LIMIT) : null,
    people: [
      ...new Set([...list(payload.Director), ...list(payload.Writer), ...list(payload.Actors)]),
    ]
      .map((name) => name.replace(/\s*\([^)]*\)\s*$/u, "").trim())
      .filter(Boolean)
      .slice(0, PEOPLE_LIMIT),
    studios: list(payload.Production),
    countries: list(payload.Country),
    languages: list(payload.Language),
    numberOfSeasons: numeric(payload.totalSeasons),
    posterUrl: posterUrl(payload.Poster),
  };
}

function omdbRatings(payload: Record<string, unknown>): TitleRatings {
  return {
    imdbScore: numeric(payload.imdbRating),
    imdbVotes: numeric(payload.imdbVotes),
    rottenTomatoes: ratingValue(payload, "Rotten Tomatoes"),
    metascore: numeric(payload.Metascore),
    boxOffice: money(payload.BoxOffice),
    ...awardWins(payload.Awards),
  };
}

function omdbRecord(payload: Record<string, unknown>): OmdbRecord {
  const omdbType = text(payload.Type) ?? "";

  return {
    imdbId:
      typeof payload.imdbID === "string" && /^tt\d+$/u.test(payload.imdbID) ? payload.imdbID : null,
    title: text(payload.Title) ?? "",
    year: releaseYear(payload.Year),
    mediaType: omdbType === "series" ? "tv" : "movie",
    omdbType,
    ratings: omdbRatings(payload),
    facts: omdbFacts(payload),
  };
}

function lookupParams(lookup: OmdbLookup): Record<string, string> {
  if ("imdbId" in lookup) {
    return { i: lookup.imdbId };
  }

  return {
    t: lookup.title.slice(0, 120),
    ...(lookup.year ? { y: String(lookup.year) } : {}),
    ...(lookup.mediaType ? { type: lookup.mediaType === "tv" ? "series" : "movie" } : {}),
  };
}

async function requestOmdb(
  env: Bindings,
  params: Record<string, string>,
  options: { timeoutMs: number; cacheTtl: number; label: string },
) {
  if (!env.OMDB_API_KEY) {
    throw new OmdbError("OMDb is not configured", 503);
  }

  const url = new URL(API_BASE);

  url.search = new URLSearchParams({ apikey: env.OMDB_API_KEY, ...params }).toString();

  const response = await upstreamFetch(url, {
    source: "omdb",
    timeoutMs: options.timeoutMs,
    cacheTtl: options.cacheTtl,
  });

  if (!response.ok) {
    throw new OmdbError(`OMDb ${options.label} failed (${response.status})`, response.status);
  }

  const payload = await response.json();

  if (!isRecord(payload)) {
    throw new OmdbError("OMDb returned an invalid payload");
  }

  if (payload.Response === "False") {
    const error = text(payload.Error) ?? "OMDb has no record";
    const lower = error.toLowerCase();

    if (lower.includes("limit")) {
      throw new OmdbError("OMDb daily limit reached", 429);
    }

    if (NOT_FOUND_ERRORS.some((known) => lower.includes(known))) {
      return null;
    }

    throw new OmdbError(`OMDb ${options.label} reported an error: ${error}`);
  }

  return payload;
}

export async function getOmdbTitle(env: Bindings, lookup: OmdbLookup) {
  const payload = await requestOmdb(
    env,
    { ...lookupParams(lookup), plot: "full", tomatoes: "true" },
    { timeoutMs: TIMEOUT_MS, cacheTtl: RATINGS_CACHE_TTL, label: "lookup" },
  );

  return payload ? omdbRecord(payload) : null;
}

export async function getOmdbSeason(env: Bindings, imdbId: string, seasonNumber: number) {
  const payload = await requestOmdb(
    env,
    { i: imdbId, Season: String(seasonNumber) },
    { timeoutMs: TIMEOUT_MS, cacheTtl: SEASON_CACHE_TTL, label: "season lookup" },
  );

  if (!payload || !Array.isArray(payload.Episodes)) {
    return [];
  }

  return payload.Episodes.flatMap((entry): OmdbEpisode[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const episodeNumber = numeric(entry.Episode);

    if (episodeNumber === null || !Number.isInteger(episodeNumber)) {
      return [];
    }

    const imdbScore = numeric(entry.imdbRating);

    return [
      {
        episodeNumber,
        imdbId:
          typeof entry.imdbID === "string" && /^tt\d+$/u.test(entry.imdbID) ? entry.imdbID : null,
        imdbScore: imdbScore !== null && imdbScore > 0 ? imdbScore : null,
      },
    ];
  });
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

  const response = await upstreamFetch(url, {
    headers: { accept: "image/*" },
    source: "omdb",
    timeoutMs: POSTER_TIMEOUT_MS,
    cacheTtl: RATINGS_CACHE_TTL,
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

  const body = await readCappedArrayBuffer(response, MAX_POSTER_BYTES);

  return body && body.byteLength > 0 ? { body, contentType } : null;
}

export type OmdbSearchResult = {
  imdbId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  omdbType: string;
  posterUrl: string | null;
};

export async function searchOmdb(
  env: Bindings,
  query: string,
  options: { page?: number; year?: number | null; mediaType?: MediaType } = {},
) {
  if (!env.OMDB_API_KEY) {
    return [];
  }

  const payload = await requestOmdb(
    env,
    {
      s: query.slice(0, 120),
      page: String(options.page ?? 1),
      ...(options.year ? { y: String(options.year) } : {}),
      ...(options.mediaType ? { type: options.mediaType === "tv" ? "series" : "movie" } : {}),
    },
    { timeoutMs: SEARCH_TIMEOUT_MS, cacheTtl: SEARCH_CACHE_TTL, label: "search" },
  );

  if (!payload || !Array.isArray(payload.Search)) {
    return [];
  }

  return payload.Search.flatMap((entry): OmdbSearchResult[] => {
    if (!isRecord(entry) || typeof entry.imdbID !== "string") {
      return [];
    }

    if (!/^tt\d+$/u.test(entry.imdbID) || typeof entry.Title !== "string") {
      return [];
    }

    return [
      {
        imdbId: entry.imdbID,
        title: entry.Title,
        year: releaseYear(entry.Year),
        mediaType: entry.Type === "series" ? "tv" : "movie",
        omdbType: text(entry.Type) ?? "",
        posterUrl: posterUrl(entry.Poster),
      },
    ];
  });
}
