import { traceUpstream } from "../../lib/upstream-usage.ts";
import { numberAt, records, stringAt } from "../../lib/values.ts";
import { UPSTREAM_AGENT } from "../fetch.ts";
import {
  CinemaSourceError,
  businessDayOf,
  type CinemaSource,
  type SourceCinema,
  type SourceFilm,
  type SourceHarvest,
  type SourceScreening,
} from "./types.ts";

const ORIGIN = "https://www.picturehouses.com";
const LISTINGS = `${ORIGIN}/api/scheduled-movies-ajax`;

const SLUG_PATTERN = /https:\/\/www\.picturehouses\.com\/cinema\/([a-z0-9-]+)/gu;
const SITE_ID_PATTERN = /cinema_id: *"(\d{3})"/u;
const MAX_SITES = 40;

const IGNORED_ATTRIBUTES = new Set(["reserved", "unreserved", "allocated"]);

async function fetchText(url: string) {
  const response = await traceUpstream("picturehouse", () =>
    fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-GB,en;q=0.9",
        "user-agent": UPSTREAM_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      cf: { cacheEverything: true, cacheTtl: 21_600 },
    }),
  );

  if (!response.ok) {
    throw new CinemaSourceError(`Picturehouse answered ${response.status}`, response.status);
  }

  return response.text();
}

async function postForm(form: Record<string, string>) {
  const response = await traceUpstream("picturehouse", () =>
    fetch(LISTINGS, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": UPSTREAM_AGENT,
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(20_000),
      cf: { cacheEverything: true, cacheTtl: 900 },
    }),
  );

  if (!response.ok) {
    throw new CinemaSourceError(`Picturehouse answered ${response.status}`, response.status);
  }

  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw new CinemaSourceError("Picturehouse answered with something other than JSON", 502);
  }
}

function nameFromSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => (word.length > 2 ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(" ")
    .replace(/\bs\b/gu, "'s");
}

async function listCinemas(): Promise<SourceCinema[]> {
  const index = await fetchText(`${ORIGIN}/cinemas`);
  const slugs = [...new Set([...index.matchAll(SLUG_PATTERN)].map((match) => match[1]))].filter(
    (slug): slug is string => Boolean(slug) && slug !== "SLUG",
  );
  const cinemas: SourceCinema[] = [];

  for (const slug of slugs.slice(0, MAX_SITES)) {
    // oxlint-disable-next-line no-await-in-loop
    const page = await fetchText(`${ORIGIN}/cinema/${slug}`).catch(() => "");
    const siteId = SITE_ID_PATTERN.exec(page)?.[1];

    if (!siteId) {
      continue;
    }

    cinemas.push({
      siteId,
      name: nameFromSlug(slug),
      address: null,
      postcode: null,
      latitude: null,
      longitude: null,
      bookingUrl: `${ORIGIN}/cinema/${slug}`,
    });
  }

  return cinemas;
}

function attributes(raw: unknown) {
  return Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase().trim())
        .filter((value) => value && !IGNORED_ATTRIBUTES.has(value))
        .slice(0, 8)
    : [];
}

async function harvest(cinema: SourceCinema, horizon: number): Promise<SourceHarvest> {
  const payload = await postForm({ cinema_id: cinema.siteId });
  const movies =
    payload && typeof payload === "object" ? records(Reflect.get(payload, "movies")) : [];
  const cutoff = businessDayOf(new Date(Date.now() + horizon * 86_400_000));
  const films = new Map<string, SourceFilm>();
  const screenings: SourceScreening[] = [];

  for (const movie of movies) {
    const filmId = stringAt(movie, "ScheduledFilmId");
    const title = stringAt(movie, "Title");

    if (!filmId || !title) {
      continue;
    }

    if (!films.has(filmId)) {
      films.set(filmId, {
        filmId,
        title,
        year: null,
        runtimeMinutes: numberAt(movie, "RunTime"),
        posterUrl: stringAt(movie, "image_url"),
        filmUrl: null,
      });
    }

    for (const showing of records(movie.show_times)) {
      const startsAt = stringAt(showing, "Showtime");
      const businessDay = stringAt(showing, "date_f") ?? startsAt?.slice(0, 10) ?? null;

      if (
        stringAt(showing, "CinemaId") !== cinema.siteId ||
        !startsAt ||
        !businessDay ||
        businessDay > cutoff
      ) {
        continue;
      }

      const sessionId = stringAt(showing, "SessionId");

      screenings.push({
        siteId: cinema.siteId,
        filmId,
        sourceEventId: sessionId,
        startsAt,
        businessDay,
        precision: "exact",
        attributes: attributes(showing.SessionAttributesNames),
        bookingUrl: sessionId
          ? `${ORIGIN}/movie-details/${encodeURIComponent(cinema.siteId)}/${encodeURIComponent(
              filmId,
            )}/${encodeURIComponent(sessionId)}`
          : cinema.bookingUrl,
      });
    }
  }

  return { films: [...films.values()], screenings };
}

export const picturehouseSource: CinemaSource = {
  id: "picturehouse",
  label: "Picturehouse",
  chain: "Picturehouse",
  locatesOwnCinemas: false,
  listCinemas,
  harvest,
};
