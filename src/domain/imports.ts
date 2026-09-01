import type { MediaTitle } from "./catalog";
import { isEntryStatus, type EntryStatus } from "./entries";

export const IMPORT_SOURCES = ["trakt", "imdb", "letterboxd", "json", "csv"] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_INPUT_KINDS = [
  "connected_api",
  "official_export",
  "generic_json",
  "generic_csv",
] as const;

export type ImportInputKind = (typeof IMPORT_INPUT_KINDS)[number];

export const IMPORT_RECORD_LIMIT = 25_000;
export const IMPORT_RECORD_BATCH_LIMIT = 100;
export const IMPORT_RECORD_PAGE_LIMIT = 50;

export const IMPORT_EVENT_TYPES = ["watchlist", "watching", "watched", "rated", "dropped"] as const;

export type ImportEventType = (typeof IMPORT_EVENT_TYPES)[number];

export const IMPORT_RUN_STATUSES = [
  "staging",
  "matching",
  "ready",
  "committing",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export type ImportedActivity = {
  source: ImportSource;
  sourceSubject: string;
  sourceEventId: string;
  eventTypes: ImportEventType[];
  providerItemId?: string;
  mediaType?: "movie" | "tv";
  title: string;
  originalTitle?: string;
  year?: number;
  externalIds?: {
    tmdb?: number;
    imdb?: string;
    tvdb?: number;
  };
  season?: number;
  episode?: number;
  watchedAt?: string;
  rating?: number;
};

export type ImportCounts = {
  received: number;
  matched: number;
  review: number;
  skipped: number;
  duplicate: number;
  committed: number;
  failed: number;
};

export type ImportRun = ImportCounts & {
  id: string;
  source: ImportSource;
  sourceSubject: string;
  inputKind: ImportInputKind;
  adapterId: string;
  adapterVersion: number;
  status: ImportRunStatus;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ImportRecordStatus =
  | "pending"
  | "matched"
  | "review"
  | "unmatched"
  | "ignored"
  | "committed";

export type ImportRecord = ImportedActivity & {
  id: string;
  matchStatus: ImportRecordStatus;
  titleId: string | null;
  matchMethod: "tmdb" | "imdb" | "tvdb" | "remembered" | "title_year" | "manual" | null;
  candidateTitleIds: string[];
  validationError: string | null;
};

export type ImportRunDetail = {
  run: ImportRun;
  records: ImportRecord[];
  titles: MediaTitle[];
  recordPage: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };
};

const SOURCE_SET: ReadonlySet<string> = new Set(IMPORT_SOURCES);
const INPUT_KIND_SET: ReadonlySet<string> = new Set(IMPORT_INPUT_KINDS);
const EVENT_TYPE_SET: ReadonlySet<string> = new Set(IMPORT_EVENT_TYPES);

export function isImportSource(value: unknown): value is ImportSource {
  return typeof value === "string" && SOURCE_SET.has(value);
}

export function isImportInputKind(value: unknown): value is ImportInputKind {
  return typeof value === "string" && INPUT_KIND_SET.has(value);
}

export function isImportEventType(value: unknown): value is ImportEventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

export function importStatus(eventTypes: readonly ImportEventType[]): EntryStatus | null {
  const statuses = new Set(eventTypes.filter(isEntryStatus));

  if (statuses.has("dropped")) {
    return "dropped";
  }

  if (statuses.has("watched")) {
    return "watched";
  }

  if (statuses.has("watching")) {
    return "watching";
  }

  return statuses.has("watchlist") ? "watchlist" : null;
}
