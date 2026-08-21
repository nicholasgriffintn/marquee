import type {
  MediaTitle,
  Provider,
  ProviderAvailability,
  ProvidersResponse,
} from "../../src/domain/catalog.ts";
import { isKnownTitle } from "./validation.ts";
import {
  isNullableNumber,
  isNullableString,
  isNumberArray,
  isRecord,
  isStringArray,
  parseJson,
} from "./values.ts";

function isAvailability(value: unknown): value is ProviderAvailability {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isNullableString(value.logoUrl) &&
    isStringArray(value.offerTypes) &&
    isNullableString(value.webUrl) &&
    (value.source === "Watchmode" || value.source === "TMDB / JustWatch")
  );
}

function isMediaTitle(value: unknown): value is MediaTitle {
  return (
    isRecord(value) &&
    isKnownTitle(value.id) &&
    typeof value.tmdbId === "number" &&
    (value.mediaType === "movie" || value.mediaType === "tv") &&
    typeof value.title === "string" &&
    typeof value.originalTitle === "string" &&
    typeof value.overview === "string" &&
    isNullableString(value.releaseDate) &&
    isNullableNumber(value.year) &&
    isNullableNumber(value.runtimeMinutes) &&
    isNullableNumber(value.numberOfSeasons) &&
    isStringArray(value.genres) &&
    isNullableString(value.certification) &&
    isNullableNumber(value.tmdbScore) &&
    typeof value.tmdbVoteCount === "number" &&
    typeof value.popularity === "number" &&
    isNullableString(value.posterUrl) &&
    isNullableString(value.backdropUrl) &&
    Array.isArray(value.providers) &&
    value.providers.every(isAvailability) &&
    isNullableString(value.watchLink) &&
    typeof value.tmdbUrl === "string" &&
    isNullableString(value.imdbUrl)
  );
}

function isProvider(value: unknown): value is Provider {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.mark === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.integration === "string" &&
    typeof value.status === "string" &&
    typeof value.sourceLabel === "string" &&
    isNullableString(value.logoUrl) &&
    typeof value.displayPriority === "number" &&
    isNullableString(value.homepage) &&
    isNumberArray(value.watchmodeSourceIds) &&
    isNumberArray(value.tmdbProviderIds)
  );
}

function isProvidersResponse(value: unknown): value is ProvidersResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.providers) &&
    value.providers.every(isProvider) &&
    value.region === "GB" &&
    isStringArray(value.sources) &&
    isStringArray(value.errors) &&
    isRecord(value.stats) &&
    typeof value.stats.configured === "number" &&
    typeof value.stats.feeds === "number" &&
    typeof value.stats.links === "number" &&
    typeof value.stats.markers === "number" &&
    typeof value.stats.longTail === "number" &&
    typeof value.fetchedAt === "string"
  );
}

export function parseStoredTitle(value: string) {
  const parsed = parseJson(value);

  return isMediaTitle(parsed) ? parsed : null;
}

export function parseStoredTitleIds(value: string) {
  const parsed = parseJson(value);

  return isStringArray(parsed) ? parsed.filter(isKnownTitle) : [];
}

export function parseStoredProviders(value: string) {
  const parsed = parseJson(value);

  return isProvidersResponse(parsed) ? parsed : null;
}
