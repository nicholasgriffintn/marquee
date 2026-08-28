import { parseDate } from "../lib/dates";

export type ScreeningPrecision = "exact" | "day" | "listing";

export type Cinema = {
  id: string;
  source: string;
  name: string;
  chain: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  bookingUrl: string | null;
  distanceKm: number | null;
};

export type Screening = {
  id: string;
  startsAt: string | null;
  businessDay: string;
  precision: ScreeningPrecision;
  attributes: string[];
  bookingUrl: string | null;
};

export type CinemaListing = {
  cinema: Cinema;
  screenings: Screening[];
};

export type ViewerOrigin = {
  latitude: number;
  longitude: number;
  label: string | null;
  source: "edge";
};

export type TitleShowings = {
  listings: CinemaListing[];
  origin: ViewerOrigin | null;
  radiusKm: number;
  fetchedAt: string;
};

export type LocalShowing = {
  titleId: string;
  cinemaCount: number;
  nextStartsAt: string | null;
  businessDays: string[];
  nearestCinema: string | null;
  nearestDistanceKm: number | null;
};

export const DEFAULT_RADIUS_KM = 16;
export const MAX_RADIUS_KM = 80;
export const SHOWING_HORIZON_DAYS = 7;

const FORMAT_ORDER = [
  "imax",
  "4dx",
  "screenx",
  "dolby",
  "70mm",
  "35mm",
  "3d",
  "subtitled",
  "audio-described",
  "relaxed",
  "kids' club",
  "autism friendly",
];

export function attributeRank(attribute: string) {
  return FORMAT_ORDER.indexOf(attribute.toLowerCase());
}

/** Recognised attributes only, most notable first. */
export function displayAttributes(attributes: string[]) {
  return attributes
    .filter((attribute) => attributeRank(attribute) !== -1)
    .toSorted((left, right) => attributeRank(left) - attributeRank(right));
}

export function distanceLabel(distanceKm: number | null) {
  if (distanceKm === null) {
    return null;
  }

  const miles = distanceKm * 0.621_371;

  return miles < 0.1 ? "here" : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

export function screeningTime(screening: Screening) {
  if (screening.precision !== "exact" || !screening.startsAt) {
    return null;
  }

  return (
    parseDate(screening.startsAt)?.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) ?? null
  );
}

export function dayLabel(businessDay: string, now = new Date()) {
  const parsed = parseDate(`${businessDay}T00:00:00`);

  if (!parsed) {
    return businessDay;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Tomorrow";
  }

  return parsed.toLocaleDateString(undefined, {
    weekday: days < 7 ? "short" : undefined,
    day: days < 7 ? undefined : "numeric",
    month: days < 7 ? undefined : "short",
  });
}
