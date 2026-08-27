import { numberAt, records, stringAt } from "../../lib/values.ts";
import {
  businessDayOf,
  fetchSourceJson,
  type CinemaSource,
  type SourceCinema,
  type SourceFilm,
  type SourceHarvest,
  type SourceScreening,
} from "./types.ts";

const BASE = "https://www.myvue.com/api/microservice/showings";

/**
 * Vue answers three collection endpoints anonymously and gates everything that
 * carries a clock time. `showingDates` sits in between: it answers, but only for
 * one exact query signature and under a tight rate limit, so a refusal there is
 * expected rather than exceptional and simply costs us precision.
 */
const DATE_QUERY = (siteId: string, filmId: string) =>
  `${BASE}/showingDates?cinemaId=${encodeURIComponent(siteId)}&filmId=${encodeURIComponent(
    filmId,
  )}&minEmbargoLevel=1&forNextWeek=true`;

const MAX_FILMS_PER_SITE = 30;

function result(payload: unknown) {
  return payload && typeof payload === "object" ? Reflect.get(payload, "result") : null;
}

async function listCinemas(): Promise<SourceCinema[]> {
  const payload = await fetchSourceJson(`${BASE}/cinemas`);
  const groups = records(result(payload));

  return groups.flatMap((group) =>
    records(group.cinemas).flatMap((cinema): SourceCinema[] => {
      const siteId = stringAt(cinema, "cinemaId");
      const name = stringAt(cinema, "fullName") ?? stringAt(cinema, "cinemaName");

      if (!siteId || !name || stringAt(cinema, "venueCurrency") !== "GBP") {
        return [];
      }

      return [
        {
          siteId,
          name: `Vue ${stringAt(cinema, "cinemaName") ?? name}`,
          address: null,
          postcode: null,
          latitude: null,
          longitude: null,
          bookingUrl: stringAt(cinema, "whatsOnUrl"),
        },
      ];
    }),
  );
}

async function filmsAt(siteId: string): Promise<SourceFilm[]> {
  const payload = await fetchSourceJson(`${BASE}/films?cinemaId=${encodeURIComponent(siteId)}`);

  return records(result(payload)).flatMap((film): SourceFilm[] => {
    const filmId = stringAt(film, "filmId");
    const title = stringAt(film, "filmTitle");

    if (!filmId || !title) {
      return [];
    }

    const releaseDate = stringAt(film, "releaseDate");

    return [
      {
        filmId,
        title,
        year: releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) || null : null,
        runtimeMinutes: numberAt(film, "runningTime"),
        posterUrl: stringAt(film, "posterImageSrc"),
        filmUrl: stringAt(film, "filmUrl"),
      },
    ];
  });
}

async function daysFor(siteId: string, filmId: string) {
  const payload = await fetchSourceJson(DATE_QUERY(siteId, filmId));

  return records(result(payload)).flatMap((entry) => {
    const showingDate = stringAt(entry, "showingDate");

    return showingDate && entry.hasShowings === true ? [showingDate.slice(0, 10)] : [];
  });
}

async function harvest(cinema: SourceCinema, horizon: number): Promise<SourceHarvest> {
  const films = (await filmsAt(cinema.siteId)).slice(0, MAX_FILMS_PER_SITE);
  const cutoff = businessDayOf(new Date(Date.now() + horizon * 86_400_000));
  const today = businessDayOf(new Date());
  const screenings: SourceScreening[] = [];

  for (const film of films) {
    // oxlint-disable-next-line no-await-in-loop
    const days = await daysFor(cinema.siteId, film.filmId).catch(() => null);

    if (days === null) {
      screenings.push({
        siteId: cinema.siteId,
        filmId: film.filmId,
        sourceEventId: null,
        startsAt: null,
        businessDay: today,
        precision: "listing",
        attributes: [],
        bookingUrl: film.filmUrl ?? cinema.bookingUrl,
      });
      continue;
    }

    for (const day of days) {
      if (day > cutoff) {
        continue;
      }

      screenings.push({
        siteId: cinema.siteId,
        filmId: film.filmId,
        sourceEventId: null,
        startsAt: null,
        businessDay: day,
        precision: "day",
        attributes: [],
        bookingUrl: film.filmUrl ?? cinema.bookingUrl,
      });
    }
  }

  return { films, screenings };
}

export const vueSource: CinemaSource = {
  id: "vue",
  label: "Vue",
  chain: "Vue",
  locatesOwnCinemas: false,
  listCinemas,
  harvest,
};
