import type { ScreeningPrecision } from "../../../src/domain/cinema.ts";
import { UPSTREAM_AGENT } from "../fetch.ts";
import { upstreamError } from "../upstream.ts";

export const CinemaSourceError = upstreamError("CinemaSourceError");

export type SourceCinema = {
  siteId: string;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  bookingUrl: string | null;
};

export type SourceFilm = {
  filmId: string;
  title: string;
  year: number | null;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  filmUrl: string | null;
};

export type SourceScreening = {
  siteId: string;
  filmId: string;
  startsAt: string | null;
  businessDay: string;
  precision: ScreeningPrecision;
  attributes: string[];
  bookingUrl: string | null;
};

export type SourceHarvest = {
  films: SourceFilm[];
  screenings: SourceScreening[];
};

/**
 * A cinema chain that publishes machine-readable listings.
 *
 * `harvest` is deliberately the only screening entry point: a source is free to
 * answer with whatever precision it can manage on the day, and to fall back to a
 * coarser precision when a finer endpoint stops answering. The surface above
 * never learns which chain it is talking to.
 */
export type CinemaSource = {
  id: string;
  label: string;
  chain: string;
  /** Sources that cannot supply their own coordinates get them geocoded on ingest. */
  locatesOwnCinemas: boolean;
  listCinemas: () => Promise<SourceCinema[]>;
  harvest: (cinema: SourceCinema, horizonDays: number) => Promise<SourceHarvest>;
};

export function businessDayOf(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function horizonDays(days: number, from = new Date()) {
  return Array.from({ length: Math.max(1, days) }, (_, index) =>
    businessDayOf(new Date(from.getTime() + index * 86_400_000)),
  );
}

export async function fetchSourceJson(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  headers.set("accept", "application/json");
  headers.set("accept-language", "en-GB,en;q=0.9");
  headers.set("user-agent", UPSTREAM_AGENT);

  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
    cf: { cacheEverything: true, cacheTtl: 900 },
  });

  if (!response.ok) {
    throw new CinemaSourceError(`Source answered ${response.status}`, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("json")) {
    throw new CinemaSourceError("Source answered with something other than JSON", 502);
  }

  return response.json() as Promise<unknown>;
}
