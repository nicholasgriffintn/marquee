export type Extent = { width: number; height: number };

export type Coordinate = { latitude: number; longitude: number };

export type Meridian = { longitude: number; x: number; label: string };

export type Parallel = { latitude: number; y: number; label: string };

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MERIDIAN_STEP = 30;
const PARALLEL_STEP = 30;

export function project(point: Coordinate, extent: Extent) {
  const x = ((point.longitude + MAX_LONGITUDE) / (MAX_LONGITUDE * 2)) * extent.width;
  const y = ((MAX_LATITUDE - point.latitude) / (MAX_LATITUDE * 2)) * extent.height;

  return { x, y };
}

function degreeLabel(value: number, positive: string, negative: string) {
  if (value === 0) {
    return "0°";
  }

  return `${Math.abs(value)}°${value > 0 ? positive : negative}`;
}

export function meridians(extent: Extent): Meridian[] {
  const lines: Meridian[] = [];

  for (
    let longitude = -MAX_LONGITUDE + MERIDIAN_STEP;
    longitude < MAX_LONGITUDE;
    longitude += MERIDIAN_STEP
  ) {
    lines.push({
      longitude,
      x: project({ latitude: 0, longitude }, extent).x,
      label: degreeLabel(longitude, "E", "W"),
    });
  }

  return lines;
}

export function parallels(extent: Extent): Parallel[] {
  const lines: Parallel[] = [];

  for (
    let latitude = -MAX_LATITUDE + PARALLEL_STEP;
    latitude < MAX_LATITUDE;
    latitude += PARALLEL_STEP
  ) {
    lines.push({
      latitude,
      y: project({ latitude, longitude: 0 }, extent).y,
      label: degreeLabel(latitude, "N", "S"),
    });
  }

  return lines;
}

export function bearingLabel(point: Coordinate) {
  const northing = degreeLabel(Math.round(point.latitude), "N", "S");
  const easting = degreeLabel(Math.round(point.longitude), "E", "W");

  return `${northing}, ${easting}`;
}
