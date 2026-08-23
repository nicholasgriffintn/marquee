import type { RevivalKind, RevivalRightsBasis } from "../../src/domain/revival.ts";
import { isRecord } from "../lib/values.ts";

const SEARCH_ENDPOINT = "https://archive.org/advancedsearch.php";
const METADATA_ENDPOINT = "https://archive.org/metadata";
const DOWNLOAD_ORIGIN = "https://archive.org/download";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 50;

const PLAYABLE_FORMATS = ["h.264 ia", "h.264", "mpeg4", "512kb mpeg4", "ogg video"];

export const ARCHIVE_COLLECTIONS = [
  "feature_films",
  "silent_films",
  "short_films",
  "prelinger",
  "classic_cartoons",
  "Film_Noir",
  "SciFi_Horror",
] as const;

export function isArchiveCollection(value: unknown): value is string {
  return ARCHIVE_COLLECTIONS.includes(value as (typeof ARCHIVE_COLLECTIONS)[number]);
}

export type ArchiveCandidate = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  kind: RevivalKind;
  runtimeSeconds: number | null;
  stillUrl: string | null;
  streamUrl: string;
  streamBytes: number | null;
  streamType: string;
  width: number | null;
  height: number | null;
  rightsBasis: RevivalRightsBasis;
  rightsNote: string;
  rightsUrl: string | null;
};

type SearchDocument = {
  identifier?: unknown;
  title?: unknown;
  year?: unknown;
  licenseurl?: unknown;
};

async function readJson(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
    cf: { cacheEverything: true, cacheTtl: 3_600 },
  });

  if (!response.ok) {
    throw new Error(`Internet Archive responded ${response.status}`);
  }

  return (await response.json()) as unknown;
}

export async function searchArchiveCollection(collection: string, page: number, cutoff: number) {
  const url = new URL(SEARCH_ENDPOINT);

  url.searchParams.set(
    "q",
    `collection:(${collection}) AND mediatype:(movies) AND (licenseurl:(*publicdomain*) OR year:[1 TO ${cutoff}])`,
  );
  url.searchParams.set("rows", String(PAGE_SIZE));
  url.searchParams.set("page", String(Math.max(1, page)));
  url.searchParams.set("sort[]", "downloads desc");
  url.searchParams.set("output", "json");

  for (const field of ["identifier", "title", "year", "licenseurl"]) {
    url.searchParams.append("fl[]", field);
  }

  const payload = await readJson(url.toString());
  const response = isRecord(payload) && isRecord(payload.response) ? payload.response : null;
  const docs = Array.isArray(response?.docs) ? (response.docs as SearchDocument[]) : [];
  const total = typeof response?.numFound === "number" ? response.numFound : 0;

  return {
    total,
    identifiers: docs.flatMap((doc) =>
      typeof doc.identifier === "string" && /^[\w.-]{1,120}$/u.test(doc.identifier)
        ? [doc.identifier]
        : [],
    ),
  };
}

function firstString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  return Array.isArray(value) && typeof value[0] === "string" ? value[0].trim() : "";
}

function numberOrNull(value: unknown) {
  const parsed = Number(firstString(value) || value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stripMarkup(value: string) {
  return value
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll(/&[a-z]+;/giu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function licenseBasis(licenseUrl: string): RevivalRightsBasis | null {
  const value = licenseUrl.toLowerCase();

  if (value.includes("publicdomain/zero")) {
    return "cc0";
  }

  return value.includes("publicdomain") ? "pd-mark" : null;
}

function bestDerivative(files: unknown) {
  if (!Array.isArray(files)) {
    return null;
  }

  const playable = files.flatMap((file) => {
    if (!isRecord(file) || typeof file.name !== "string") {
      return [];
    }

    const format = firstString(file.format).toLowerCase();
    const rank = PLAYABLE_FORMATS.indexOf(format);

    if (rank < 0 || !/\.(mp4|m4v|ogv)$/iu.test(file.name)) {
      return [];
    }

    return [
      {
        name: file.name,
        rank,
        bytes: numberOrNull(file.size),
        seconds: durationSeconds(firstString(file.length)),
        width: numberOrNull(file.width),
        height: numberOrNull(file.height),
        type: /\.ogv$/iu.test(file.name) ? "video/ogg" : "video/mp4",
      },
    ];
  });

  playable.sort((left, right) => left.rank - right.rank || (right.bytes ?? 0) - (left.bytes ?? 0));

  return playable[0] ?? null;
}

function durationSeconds(value: string) {
  if (!value) {
    return null;
  }

  if (!value.includes(":")) {
    const seconds = Number(value);

    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  }

  const parts = value.split(":").map(Number);

  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const total = parts.reduce((sum, part) => sum * 60 + part, 0);

  return total > 0 ? Math.round(total) : null;
}

const SHORT_MAX_SECONDS = 45 * 60;

function kindFor(collections: string[], seconds: number | null): RevivalKind {
  if (collections.includes("prelinger")) {
    return "ephemeral";
  }

  return seconds !== null && seconds <= SHORT_MAX_SECONDS ? "short" : "feature";
}

export async function readArchiveItem(identifier: string): Promise<ArchiveCandidate | null> {
  const payload = await readJson(`${METADATA_ENDPOINT}/${encodeURIComponent(identifier)}`);

  if (!isRecord(payload) || payload.is_dark === true || !isRecord(payload.metadata)) {
    return null;
  }

  const metadata = payload.metadata;
  const title = firstString(metadata.title);
  const derivative = bestDerivative(payload.files);

  if (!title || !derivative) {
    return null;
  }

  const collections = Array.isArray(metadata.collection)
    ? metadata.collection.filter((entry): entry is string => typeof entry === "string")
    : [firstString(metadata.collection)].filter(Boolean);
  const licenseUrl = firstString(metadata.licenseurl);
  const basis = licenseBasis(licenseUrl);
  const year = numberOrNull(metadata.year) ?? yearFromDate(firstString(metadata.date));
  const runtimeSeconds = derivative.seconds ?? durationSeconds(firstString(metadata.runtime));

  return {
    sourceId: identifier,
    sourceUrl: `https://archive.org/details/${identifier}`,
    title: title.slice(0, 200),
    year,
    director: firstString(metadata.director || metadata.creator).slice(0, 120) || null,
    synopsis: stripMarkup(firstString(metadata.description)).slice(0, 1_200),
    kind: kindFor(collections, runtimeSeconds),
    runtimeSeconds,
    stillUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    streamUrl: `${DOWNLOAD_ORIGIN}/${encodeURIComponent(identifier)}/${encodeURI(derivative.name)}`,
    streamBytes: derivative.bytes,
    streamType: derivative.type,
    width: derivative.width,
    height: derivative.height,
    rightsBasis: basis ?? "unclear",
    rightsNote: basis
      ? `Uploaded to the Internet Archive under ${licenseUrl}`
      : "No public domain marker on the Internet Archive item",
    rightsUrl: licenseUrl || null,
  };
}

function yearFromDate(value: string) {
  const match = /(1[6-9]\d{2}|20\d{2})/u.exec(value);

  return match ? Number(match[1]) : null;
}
