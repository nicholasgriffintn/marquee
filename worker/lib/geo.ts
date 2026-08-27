import type { ViewerOrigin } from "../../src/domain/cinema.ts";

const EARTH_RADIUS_KM = 6_371;
const DEGREE_KM = 111.32;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function boundingBox(origin: { latitude: number; longitude: number }, radiusKm: number) {
  const latitudeSpan = radiusKm / DEGREE_KM;
  const cosine = Math.max(0.01, Math.cos((origin.latitude * Math.PI) / 180));

  return {
    minLatitude: origin.latitude - latitudeSpan,
    maxLatitude: origin.latitude + latitudeSpan,
    minLongitude: origin.longitude - latitudeSpan / cosine,
    maxLongitude: origin.longitude + latitudeSpan / cosine,
  };
}

function coordinate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function edgeOrigin(request: Request): ViewerOrigin | null {
  const cf = (request as { cf?: Record<string, unknown> }).cf;

  if (!cf) {
    return null;
  }

  const latitude = coordinate(cf.latitude);
  const longitude = coordinate(cf.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  const city = typeof cf.city === "string" ? cf.city : null;
  const region = typeof cf.region === "string" ? cf.region : null;

  return {
    latitude,
    longitude,
    label: city ?? region,
    source: "edge",
  };
}

/** Buckets a position to roughly a town, for counting where interest actually is. */
export function interestCell(origin: { latitude: number; longitude: number }) {
  return `${origin.latitude.toFixed(1)},${origin.longitude.toFixed(1)}`;
}
