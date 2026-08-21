import { isRecord } from "../lib/values.ts";
import type { Bindings, TitleRatings } from "../types.ts";

const API_BASE = "https://www.omdbapi.com/";

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
  };
}
