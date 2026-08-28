import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  SHOWING_HORIZON_DAYS,
  type CinemaListing,
  type TitleShowings,
  type ViewerOrigin,
} from "../../src/domain/cinema.ts";
import { readRanked } from "../repositories/catalog-search.ts";
import {
  noteInterest,
  readNearbyCinemas,
  readScreeningsForTitle,
  readShowingTitles,
} from "../repositories/cinemas.ts";
import type { Bindings } from "../types.ts";

export function clampRadius(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed)
    ? Math.max(2, Math.min(MAX_RADIUS_KM, parsed))
    : DEFAULT_RADIUS_KM;
}

export async function getTitleShowings(
  env: Bindings,
  titleId: string,
  origin: ViewerOrigin | null,
  radiusKm: number,
): Promise<TitleShowings> {
  const fetchedAt = new Date().toISOString();

  if (!origin) {
    return { listings: [], origin: null, radiusKm, fetchedAt };
  }

  const cinemas = await readNearbyCinemas(env.DB, origin, radiusKm);

  if (cinemas.length === 0) {
    return { listings: [], origin, radiusKm, fetchedAt };
  }

  const screenings = await readScreeningsForTitle(
    env.DB,
    titleId,
    cinemas.map((cinema) => cinema.id),
    SHOWING_HORIZON_DAYS,
  );
  const byCinema = new Map<string, CinemaListing>();

  for (const cinema of cinemas) {
    byCinema.set(cinema.id, { cinema, screenings: [] });
  }

  for (const screening of screenings) {
    byCinema.get(screening.cinemaId)?.screenings.push({
      id: screening.id,
      startsAt: screening.startsAt,
      businessDay: screening.businessDay,
      precision: screening.precision,
      attributes: screening.attributes,
      bookingUrl: screening.bookingUrl,
    });
  }

  const listings = [...byCinema.values()]
    .filter((listing) => listing.screenings.length > 0)
    .toSorted((left, right) => (left.cinema.distanceKm ?? 0) - (right.cinema.distanceKm ?? 0));

  return { listings, origin, radiusKm, fetchedAt };
}

export async function getLocalShowings(
  env: Bindings,
  origin: ViewerOrigin | null,
  radiusKm: number,
  limit = 24,
) {
  if (!origin) {
    return { items: [], origin: null, radiusKm, fetchedAt: new Date().toISOString() };
  }

  const cinemas = await readNearbyCinemas(env.DB, origin, radiusKm);
  const showings = await readShowingTitles(
    env.DB,
    cinemas.map((cinema) => cinema.id),
    SHOWING_HORIZON_DAYS,
    limit,
  );
  const items = await readRanked(
    env.DB,
    showings.map((showing) => showing.titleId),
  );
  const order = new Map(showings.map((showing, index) => [showing.titleId, index]));

  return {
    items: items.toSorted((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)),
    cinemas: cinemas.slice(0, 8),
    origin,
    radiusKm,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getNearbyCinemas(
  env: Bindings,
  origin: ViewerOrigin | null,
  radiusKm: number,
) {
  if (!origin) {
    return { cinemas: [], origin: null, radiusKm, fetchedAt: new Date().toISOString() };
  }

  return {
    cinemas: await readNearbyCinemas(env.DB, origin, radiusKm),
    origin,
    radiusKm,
    fetchedAt: new Date().toISOString(),
  };
}

export async function rememberInterest(env: Bindings, origin: ViewerOrigin | null) {
  if (!origin) {
    return;
  }

  await noteInterest(env.DB, origin).catch(() => undefined);
}
