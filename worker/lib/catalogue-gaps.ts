import type { MediaTitle } from "../../src/domain/catalog.ts";
import { comparableTitle } from "./text.ts";

export const GAP_DISCOVERY = {
  minQueryLength: 3,
  maxQueryLength: 60,
  maxQueryWords: 6,
  adequateResults: 5,
  searchPages: 2,
  searchPageSize: 10,
  queuePerLookup: 6,
  queuePerHour: 120,
  lookupCooldownHours: 6,
  titleCooldownDays: 30,
  budgetReserve: 100_000,
  resultCacheSeconds: 1_800,
  retentionDays: 60,
} as const;

const BROWSE_TERMS = new Set([
  "a",
  "action",
  "adventure",
  "an",
  "and",
  "anime",
  "best",
  "comedy",
  "documentary",
  "drama",
  "family",
  "film",
  "films",
  "for",
  "good",
  "horror",
  "in",
  "movie",
  "movies",
  "netflix",
  "new",
  "of",
  "on",
  "romance",
  "scary",
  "series",
  "show",
  "shows",
  "the",
  "thriller",
  "to",
  "top",
  "tv",
  "watch",
  "with",
]);

export function gapQueryKey(query: string) {
  return comparableTitle(query).slice(0, GAP_DISCOVERY.maxQueryLength);
}

export function hasTitleIntent(query: string) {
  const key = gapQueryKey(query);

  if (
    key.length < GAP_DISCOVERY.minQueryLength ||
    query.trim().length > GAP_DISCOVERY.maxQueryLength
  ) {
    return false;
  }

  const named = key.split(" ").filter((word) => word && !BROWSE_TERMS.has(word));

  return named.length > 0 && named.length <= GAP_DISCOVERY.maxQueryWords;
}

export function hasAdequateResults(query: string, items: MediaTitle[]) {
  if (items.length >= GAP_DISCOVERY.adequateResults) {
    return true;
  }

  const key = gapQueryKey(query);

  return items.some((item) =>
    [item.title, item.originalTitle].some((name) => name && comparableTitle(name) === key),
  );
}
