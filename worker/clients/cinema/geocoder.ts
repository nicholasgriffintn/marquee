import { UPSTREAM_AGENT } from "../fetch.ts";
import { CinemaSourceError } from "./types.ts";

const OVERPASS = "https://overpass-api.de/api/interpreter";

export type GeocodedVenue = {
  name: string;
  latitude: number;
  longitude: number;
  postcode: string | null;
  address: string | null;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Chains that publish listings without coordinates get them from OpenStreetMap,
 * matched on brand. Data is ODbL — see the attribution on the Sources page.
 */
export async function geocodeChain(brand: string): Promise<GeocodedVenue[]> {
  const query = `[out:json][timeout:50];nwr["amenity"="cinema"]["brand"~"${brand.replaceAll(
    /[^\w\s-]/gu,
    "",
  )}",i](49.8,-8.7,60.9,1.8);out tags center;`;

  const response = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UPSTREAM_AGENT,
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(60_000),
    cf: { cacheEverything: true, cacheTtl: 604_800 },
  });

  if (!response.ok) {
    throw new CinemaSourceError(`Overpass answered ${response.status}`, response.status);
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };

  return (payload.elements ?? []).flatMap((element): GeocodedVenue[] => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const name = element.tags?.name;

    if (typeof latitude !== "number" || typeof longitude !== "number" || !name) {
      return [];
    }

    const street = element.tags?.["addr:street"];
    const houseNumber = element.tags?.["addr:housenumber"];
    const city = element.tags?.["addr:city"];

    return [
      {
        name,
        latitude,
        longitude,
        postcode: element.tags?.["addr:postcode"] ?? null,
        address:
          [[houseNumber, street].filter(Boolean).join(" "), city].filter(Boolean).join(", ") ||
          null,
      },
    ];
  });
}

const NOISE =
  /\b(cinema|cinemas|picturehouse|the|vue|odeon|cineworld|multiplex|theatre|at|and)\b/gu;

export function normaliseVenueName(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
    .replaceAll(NOISE, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * Venue names never match exactly across sources, so this scores on shared
 * significant words rather than string distance: "Vue Accrington" against
 * "Vue Cinema Accrington" should land, "Vue Bury" against "Vue Bury St Edmunds"
 * should not win outright over an exact "Vue Bury".
 */
export function matchVenue(name: string, venues: GeocodedVenue[]) {
  const wanted = new Set(normaliseVenueName(name).split(" ").filter(Boolean));

  if (wanted.size === 0) {
    return null;
  }

  let best: { venue: GeocodedVenue; score: number } | null = null;

  for (const venue of venues) {
    const words = normaliseVenueName(venue.name).split(" ").filter(Boolean);

    if (words.length === 0) {
      continue;
    }

    const shared = words.filter((word) => wanted.has(word)).length;

    if (shared === 0) {
      continue;
    }

    const score = (2 * shared) / (wanted.size + words.length);

    if (!best || score > best.score) {
      best = { venue, score };
    }
  }

  return best && best.score >= 0.6 ? best.venue : null;
}
