import {
  isImportEventType,
  isImportInputKind,
  isImportSource,
  type ImportedActivity,
} from "../../../src/domain/imports.ts";
import { isRecord } from "../../lib/values.ts";

const SOURCE_SUBJECT_LIMIT = 120;
const EVENT_ID_LIMIT = 160;
const TITLE_LIMIT = 160;
const PROVIDER_ITEM_LIMIT = 200;

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function optionalText(value: unknown, limit: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

function timestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 40) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() < 1870 ||
    parsed.getUTCFullYear() > 2100
    ? undefined
    : parsed.toISOString();
}

function parsedExternalIds(value: unknown): ImportedActivity["externalIds"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const tmdb = integer(value.tmdb, 1, 9_999_999_999);
  const tvdb = integer(value.tvdb, 1, 9_999_999_999);
  const imdb =
    typeof value.imdb === "string" && /^tt\d{3,12}$/u.test(value.imdb) ? value.imdb : undefined;

  return tmdb || tvdb || imdb
    ? { ...(tmdb ? { tmdb } : {}), ...(tvdb ? { tvdb } : {}), ...(imdb ? { imdb } : {}) }
    : undefined;
}

export function parseImportRunInput(value: unknown) {
  if (!isRecord(value) || !isImportSource(value.source) || !isImportInputKind(value.inputKind)) {
    return null;
  }

  const sourceSubject =
    typeof value.sourceSubject === "string"
      ? value.sourceSubject.trim().slice(0, SOURCE_SUBJECT_LIMIT)
      : "";
  const adapterId = typeof value.adapterId === "string" ? value.adapterId.trim() : "";
  const adapterVersion = integer(value.adapterVersion, 1, 10_000);
  const inputFingerprint = typeof value.inputFingerprint === "string" ? value.inputFingerprint : "";

  if (
    !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(adapterId) ||
    !adapterVersion ||
    !/^[0-9a-f]{64}$/u.test(inputFingerprint)
  ) {
    return null;
  }

  return {
    source: value.source,
    sourceSubject,
    inputKind: value.inputKind,
    adapterId,
    adapterVersion,
    inputFingerprint,
  };
}

export function parseImportedActivity(value: unknown): ImportedActivity | null {
  if (!isRecord(value) || !isImportSource(value.source)) {
    return null;
  }

  const sourceSubject =
    typeof value.sourceSubject === "string"
      ? value.sourceSubject.trim().slice(0, SOURCE_SUBJECT_LIMIT)
      : "";
  const sourceEventId =
    typeof value.sourceEventId === "string"
      ? value.sourceEventId.trim().slice(0, EVENT_ID_LIMIT)
      : "";
  const title = typeof value.title === "string" ? value.title.trim().slice(0, TITLE_LIMIT) : "";
  const eventTypes = Array.isArray(value.eventTypes)
    ? [...new Set(value.eventTypes.filter(isImportEventType))]
    : [];
  const rating = integer(value.rating, 1, 5);

  if (
    !sourceEventId ||
    !title ||
    eventTypes.length === 0 ||
    (eventTypes.includes("rated") && !rating)
  ) {
    return null;
  }

  const watchedAt = timestamp(value.watchedAt);

  return {
    source: value.source,
    sourceSubject,
    sourceEventId,
    eventTypes,
    ...(optionalText(value.providerItemId, PROVIDER_ITEM_LIMIT)
      ? { providerItemId: optionalText(value.providerItemId, PROVIDER_ITEM_LIMIT) }
      : {}),
    ...(value.mediaType === "movie" || value.mediaType === "tv"
      ? { mediaType: value.mediaType }
      : {}),
    title,
    ...(optionalText(value.originalTitle, TITLE_LIMIT)
      ? { originalTitle: optionalText(value.originalTitle, TITLE_LIMIT) }
      : {}),
    ...(integer(value.year, 1870, 2100) ? { year: integer(value.year, 1870, 2100) } : {}),
    ...(parsedExternalIds(value.externalIds)
      ? { externalIds: parsedExternalIds(value.externalIds) }
      : {}),
    ...(integer(value.season, 0, 100) !== undefined
      ? { season: integer(value.season, 0, 100) }
      : {}),
    ...(integer(value.episode, 0, 2000) !== undefined
      ? { episode: integer(value.episode, 0, 2000) }
      : {}),
    ...(watchedAt ? { watchedAt } : {}),
    ...(rating ? { rating } : {}),
  };
}
