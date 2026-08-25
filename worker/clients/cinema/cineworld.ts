import { isRecord, numberAt, records, stringAt } from "../../lib/values.ts";
import {
  fetchSourceJson,
  type CinemaSource,
  type SourceCinema,
  type SourceFilm,
  type SourceHarvest,
  type SourceScreening,
} from "./types.ts";

const BASE = "https://www.cineworld.co.uk/uk/data-api-service/v1/quickbook/10108";

const IGNORED_ATTRIBUTES = new Set([
  "reserved-selected",
  "reserved-seating",
  "unreserved",
  "alcohol",
  "no-ads",
]);

const CERTIFICATES = /^(u|pg|12a?|15|18|tbc)$/u;

function attributes(raw: unknown) {
  return Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase())
        .filter((value) => !IGNORED_ATTRIBUTES.has(value) && !CERTIFICATES.test(value))
        .slice(0, 8)
    : [];
}

function body(payload: unknown) {
  return isRecord(payload) ? payload.body : null;
}

function collection(payload: unknown, key: string) {
  const inner = body(payload);

  return isRecord(inner) ? records(inner[key]) : [];
}

async function listCinemas(): Promise<SourceCinema[]> {
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const payload = await fetchSourceJson(
    `${BASE}/cinemas/with-event/until/${until}?attr=&lang=en_GB`,
  );

  return collection(payload, "cinemas").flatMap((cinema): SourceCinema[] => {
    const siteId = stringAt(cinema, "id");
    const name = stringAt(cinema, "displayName");

    if (!siteId || !name) {
      return [];
    }

    const addressInfo = cinema.addressInfo;
    const postcode = isRecord(addressInfo) ? stringAt(addressInfo, "postalCode") : null;

    return [
      {
        siteId,
        name,
        address: stringAt(cinema, "address"),
        postcode,
        latitude: numberAt(cinema, "latitude"),
        longitude: numberAt(cinema, "longitude"),
        bookingUrl: stringAt(cinema, "link"),
      },
    ];
  });
}

async function datesFor(siteId: string, horizon: number) {
  const until = new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10);
  const payload = await fetchSourceJson(
    `${BASE}/dates/in-cinema/${encodeURIComponent(siteId)}/until/${until}?attr=&lang=en_GB`,
  );
  const inner = body(payload);
  const dates = isRecord(inner) ? inner.dates : null;

  return Array.isArray(dates)
    ? dates.filter((date): date is string => typeof date === "string").slice(0, horizon)
    : [];
}

async function harvest(cinema: SourceCinema, horizon: number): Promise<SourceHarvest> {
  const dates = await datesFor(cinema.siteId, horizon);
  const films = new Map<string, SourceFilm>();
  const screenings: SourceScreening[] = [];

  for (const date of dates) {
    // oxlint-disable-next-line no-await-in-loop
    const payload = await fetchSourceJson(
      `${BASE}/film-events/in-cinema/${encodeURIComponent(cinema.siteId)}/at-date/${date}?attr=&lang=en_GB`,
    );

    for (const film of collection(payload, "films")) {
      const filmId = stringAt(film, "id");
      const title = stringAt(film, "name");

      if (!filmId || !title || films.has(filmId)) {
        continue;
      }

      const releaseYear = stringAt(film, "releaseYear");

      films.set(filmId, {
        filmId,
        title,
        year: releaseYear ? Number.parseInt(releaseYear, 10) || null : null,
        runtimeMinutes: numberAt(film, "length"),
        posterUrl: stringAt(film, "posterLink"),
        filmUrl: stringAt(film, "link"),
      });
    }

    for (const event of collection(payload, "events")) {
      const filmId = stringAt(event, "filmId");
      const startsAt = stringAt(event, "eventDateTime");
      const businessDay = stringAt(event, "businessDay") ?? date;

      if (!filmId || !startsAt) {
        continue;
      }

      screenings.push({
        siteId: cinema.siteId,
        filmId,
        sourceEventId: stringAt(event, "id"),
        startsAt,
        businessDay,
        precision: "exact",
        attributes: attributes(event.attributeIds),
        bookingUrl: stringAt(event, "bookingLink"),
      });
    }
  }

  return { films: [...films.values()], screenings };
}

export const cineworldSource: CinemaSource = {
  id: "cineworld",
  label: "Cineworld",
  chain: "Cineworld",
  locatesOwnCinemas: true,
  listCinemas,
  harvest,
};
