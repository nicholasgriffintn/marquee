import type { MediaType } from "../../src/domain/catalog.ts";
import {
  parseWatchmodeAvailability,
  parseWatchmodeSources,
  type WatchmodeSource,
} from "../lib/watchmode-payload.ts";
import type { Bindings } from "../types.ts";

const API_BASE = "https://api.watchmode.com/v1";
const PROVIDER_REGION = "GB";

export class WatchmodeError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "WatchmodeError";
  }
}

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

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-api-key": env.WATCHMODE_API_KEY,
    },
    signal: AbortSignal.timeout(12_000),
    cf: {
      cacheEverything: true,
      cacheTtl: path === "/sources/" ? 21_600 : 900,
    },
  });

  if (!response.ok) {
    throw new WatchmodeError(
      response.status === 401 ? "Watchmode credentials were rejected" : "Watchmode request failed",
      response.status === 401 ? 503 : 502,
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

  if (!Array.isArray(payload)) {
    throw new WatchmodeError("Watchmode returned invalid availability data");
  }

  return parseWatchmodeAvailability(payload);
}
