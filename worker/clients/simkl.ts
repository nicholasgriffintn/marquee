import type { MediaType } from "../../src/domain/catalog.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings, ExternalIds } from "../types.ts";

const API_BASE = "https://api.simkl.com";

export class SimklError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "SimklError";
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const parsed = typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export async function getSimklIds(
  env: Bindings,
  mediaType: MediaType,
  tmdbId: number,
): Promise<ExternalIds | null> {
  if (!env.SIMKL_CLIENT_ID) {
    throw new SimklError("Simkl is not configured", 503);
  }

  const url = new URL(`${API_BASE}/search/id`);

  url.search = new URLSearchParams({
    tmdb: String(tmdbId),
    type: mediaType === "movie" ? "movie" : "show",
    client_id: env.SIMKL_CLIENT_ID,
  }).toString();

  const response = await fetch(url, {
    headers: { accept: "application/json", "simkl-api-key": env.SIMKL_CLIENT_ID },
    signal: AbortSignal.timeout(12_000),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new SimklError(`Simkl request failed (${response.status})`, response.status);
  }

  const payload = await response.json();

  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const [first] = payload;
  const ids = isRecord(first) && isRecord(first.ids) ? first.ids : null;

  if (!ids) {
    return null;
  }

  return {
    simklId: integer(ids.simkl ?? ids.simkl_id),
    imdbId: text(ids.imdb),
    tvdbId: integer(ids.tvdb),
    malId: integer(ids.mal),
    anilistId: integer(ids.anilist),
  };
}
