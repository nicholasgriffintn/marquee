import type { MediaType } from "../../src/domain/catalog.ts";
import {
  parseWatchmodeAvailability,
  parseWatchmodeSources,
  type WatchmodeSource,
} from "../lib/watchmode-payload.ts";
import type { Bindings } from "../types.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const CACHE_TTL = 900;
const SOURCES_CACHE_TTL = 21_600;

const API_BASE = "https://api.watchmode.com/v1";
const PROVIDER_REGION = "GB";

export const WatchmodeError = upstreamError("WatchmodeError");

async function requestWatchmode(
  env: Bindings,
  path: string,
  parameters: Record<string, string> = {},
) {
  if (!env.WATCHMODE_API_KEY) {
    throw new WatchmodeError("Watchmode is not configured", 503);
  }

  const url = new URL(`${API_BASE}${path}`);

  url.search = new URLSearchParams(parameters).toString();

  const response = await upstreamFetch(url, {
    headers: { "x-api-key": env.WATCHMODE_API_KEY },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: path === "/sources/" ? SOURCES_CACHE_TTL : CACHE_TTL,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new WatchmodeError(
      response.status === 401
        ? "Watchmode credentials were rejected"
        : `Watchmode request failed (${response.status})`,
      response.status === 401 ? 503 : response.status === 429 ? 429 : 502,
    );
  }

  return response.json();
}

export async function getWatchmodeSources(env: Bindings): Promise<WatchmodeSource[]> {
  const payload = await requestWatchmode(env, "/sources/", { regions: PROVIDER_REGION });

  if (!Array.isArray(payload)) {
    throw new WatchmodeError("Watchmode returned an invalid source list");
  }

  return parseWatchmodeSources(payload);
}

export async function getWatchmodeAvailability(
  env: Bindings,
  mediaType: MediaType,
  tmdbId: number,
) {
  const payload = await requestWatchmode(env, `/title/${mediaType}-${tmdbId}/sources/`, {
    regions: PROVIDER_REGION,
  });

  if (payload === null) {
    return [];
  }

  if (!Array.isArray(payload)) {
    throw new WatchmodeError("Watchmode returned invalid availability data");
  }

  return parseWatchmodeAvailability(payload);
}
