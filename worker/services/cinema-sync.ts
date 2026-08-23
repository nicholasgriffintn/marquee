import { SHOWING_HORIZON_DAYS } from "../../src/domain/cinema.ts";
import { geocodeChain, matchVenue } from "../clients/cinema/geocoder.ts";
import { cinemaSource, CINEMA_SOURCES } from "../clients/cinema/index.ts";
import { logError } from "../lib/logging.ts";
import {
  cinemaKey,
  locateCinema,
  readCinemasBySource,
  readInterestCells,
  readNearbyCinemas,
  readUnlocatedCinemas,
  readUnmatchedFilms,
  recordFilmMatch,
  replaceScreenings,
  storeCinemas,
  storeFilms,
} from "../repositories/cinemas.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import { findTitleForFilm } from "./cinema-matching.ts";

const INTEREST_RADIUS_KM = 24;
const CINEMAS_PER_CELL = 8;
const MATCH_BATCH = 60;

export async function syncCinemaDirectory(env: Bindings, sourceId: string) {
  const source = cinemaSource(sourceId);

  if (!source) {
    return 0;
  }

  const cinemas = await source.listCinemas();
  const stored = await storeCinemas(env.DB, source.id, source.chain, cinemas);

  if (!source.locatesOwnCinemas) {
    await locateCinemas(env, source.id, source.chain);
  }

  return stored;
}

/**
 * Chains that publish listings without coordinates are placed from OpenStreetMap.
 * A venue that cannot be placed simply never shows up in a nearby search, which
 * is a better failure than pinning it to the wrong town.
 */
async function locateCinemas(env: Bindings, sourceId: string, chain: string) {
  const pending = await readUnlocatedCinemas(env.DB, sourceId);

  if (pending.length === 0) {
    return 0;
  }

  const venues = await geocodeChain(chain).catch((error: unknown) => {
    logError("cinema_geocode_failed", error, { area: "cinema", source: sourceId });

    return [];
  });

  if (venues.length === 0) {
    return 0;
  }

  let located = 0;

  for (const cinema of pending) {
    const venue = matchVenue(cinema.name, venues);

    if (!venue) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    await locateCinema(env.DB, cinema.id, {
      latitude: venue.latitude,
      longitude: venue.longitude,
      postcode: venue.postcode,
      address: venue.address,
    });
    located += 1;
  }

  console.log(
    JSON.stringify({ event: "cinemas_located", source: sourceId, located, of: pending.length }),
  );

  return located;
}

export async function syncCinemaScreenings(env: Bindings, sourceId: string, siteId: string) {
  const source = cinemaSource(sourceId);

  if (!source) {
    return 0;
  }

  const cinemas = await readCinemasBySource(env.DB, sourceId);
  const cinema = cinemas.find((entry) => entry.siteId === siteId);

  if (!cinema) {
    return 0;
  }

  const harvest = await source.harvest(
    {
      siteId: cinema.siteId,
      name: cinema.name,
      address: cinema.address,
      postcode: cinema.postcode,
      latitude: cinema.latitude,
      longitude: cinema.longitude,
      bookingUrl: cinema.bookingUrl,
    },
    SHOWING_HORIZON_DAYS,
  );

  await storeFilms(env.DB, source.id, harvest.films);
  await matchFilms(env, source.id);

  return replaceScreenings(env.DB, source.id, cinema.id, harvest.screenings);
}

export async function matchFilms(env: Bindings, sourceId: string) {
  const pending = await readUnmatchedFilms(env.DB, sourceId, MATCH_BATCH);
  let matched = 0;

  for (const film of pending) {
    // oxlint-disable-next-line no-await-in-loop
    const result = await findTitleForFilm(env.DB, film).catch(() => null);

    if (!result) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    await recordFilmMatch(env.DB, sourceId, film.sourceFilmId, result);

    if (result.titleId) {
      matched += 1;
    }
  }

  if (pending.length > 0) {
    console.log(
      JSON.stringify({
        event: "cinema_films_matched",
        source: sourceId,
        matched,
        of: pending.length,
      }),
    );
  }

  return matched;
}

/**
 * Only cinemas near somewhere a viewer has actually looked from get refreshed.
 * The work scales with the audience rather than with the country.
 */
export async function queueCinemaScreenings(env: Bindings) {
  const cells = await readInterestCells(env.DB);

  if (cells.length === 0) {
    return 0;
  }

  const wanted = new Map<string, { source: string; siteId: string }>();

  for (const cell of cells) {
    // oxlint-disable-next-line no-await-in-loop
    const nearby = await readNearbyCinemas(env.DB, cell, INTEREST_RADIUS_KM, CINEMAS_PER_CELL);

    for (const cinema of nearby) {
      const siteId = cinema.id.slice(cinema.source.length + 1);

      wanted.set(cinema.id, { source: cinema.source, siteId });
    }
  }

  const jobs = [...wanted.values()].map(
    (entry) =>
      ({
        type: "sync-cinema-screenings",
        source: entry.source,
        siteId: entry.siteId,
      }) satisfies IngestionJob,
  );

  for (let index = 0; index < jobs.length; index += 20) {
    // oxlint-disable-next-line no-await-in-loop
    await env.INGESTION_QUEUE.sendBatch(
      jobs.slice(index, index + 20).map((body) => ({ body, contentType: "json" as const })),
    );
  }

  return jobs.length;
}

export async function queueCinemaDirectories(env: Bindings) {
  await env.INGESTION_QUEUE.sendBatch(
    CINEMA_SOURCES.map((source) => ({
      body: { type: "sync-cinemas", source: source.id } satisfies IngestionJob,
      contentType: "json" as const,
    })),
  );

  return CINEMA_SOURCES.length;
}

export { cinemaKey };
