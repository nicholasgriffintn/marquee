import type { ImportedActivity } from "../domain/imports";
import { csvObjects } from "../lib/csv";
import { importFingerprint, sourceEventId } from "../lib/import-fingerprint";
import { isRecord } from "../lib/values";
import { ImportParseError, type ImportFile, type ParsedImport } from "./types";
import { parseWatchHistoryCsv, watchHistoryShape } from "./watch-history";

const ADAPTER_VERSION = 1;
const TYPES = new Set(["movie", "show", "episode", "season"]);

export const STRUCTURED_JSON_EXAMPLE = `[
  {
    "imdb_id": "tt0068646",
    "type": "movie",
    "title": "The Godfather",
    "watched_at": "2024-10-25T20:00:00Z",
    "rating": 9,
    "rated_at": "2024-10-25T21:00:00Z"
  }
]`;

export const STRUCTURED_CSV_EXAMPLE = `imdb_id,type,title,year,season,episode,watched_at,watchlisted_at,rating,rated_at
tt0068646,movie,The Godfather,1972,,,2024-10-25T20:00:00Z,,9,2024-10-25T21:00:00Z
tt0903747,show,Breaking Bad,2008,1,1,2024-10-26T20:00:00Z,,,
`;

function text(row: Record<string, unknown>, key: string) {
  const value = row[key];

  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function integer(value: string, minimum: number, maximum: number) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function date(value: string, allowUnknown: boolean, rowNumber: number, field: string) {
  if (!value || (allowUnknown && value.toLowerCase() === "unknown")) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ImportParseError(
      `Row ${rowNumber} has an invalid ${field}. Use an ISO 8601 date.`,
      "invalid_export",
    );
  }

  return parsed.toISOString();
}

async function activities(
  source: "json" | "csv",
  row: Record<string, unknown>,
  ordinal: number,
): Promise<ImportedActivity[]> {
  const rowNumber = ordinal + 2;
  const imdb = text(row, "imdb_id");
  const tmdbValue = text(row, "tmdb_id");
  const tvdbValue = text(row, "tvdb_id");
  const tmdb = integer(tmdbValue, 1, 9_999_999_999);
  const tvdb = integer(tvdbValue, 1, 9_999_999_999);
  const year = integer(text(row, "year"), 1870, 2100);
  const season = integer(text(row, "season"), 0, 100);
  const episode = integer(text(row, "episode"), 0, 2000);
  const kind = text(row, "type").toLowerCase();
  const title = text(row, "title");
  const identity = imdb || tmdbValue || tvdbValue || title;

  if (!identity) {
    throw new ImportParseError(
      `Row ${rowNumber} needs a title or a supported external id.`,
      "invalid_export",
    );
  }

  if (imdb && !/^tt\d{3,12}$/u.test(imdb)) {
    throw new ImportParseError(`Row ${rowNumber} has an invalid imdb_id.`, "invalid_export");
  }

  if (tmdb === null || tvdb === null || year === null || season === null || episode === null) {
    throw new ImportParseError(
      `Row ${rowNumber} contains a number outside its valid range.`,
      "invalid_export",
    );
  }

  if (kind && !TYPES.has(kind)) {
    throw new ImportParseError(
      `Row ${rowNumber} has an invalid type. Use movie, show, season, or episode.`,
      "invalid_export",
    );
  }

  if (tmdb && !kind) {
    throw new ImportParseError(
      `Row ${rowNumber} needs a type so its tmdb_id can be matched.`,
      "invalid_export",
    );
  }

  if (
    (kind === "episode" || episode !== undefined) &&
    (season === undefined || episode === undefined)
  ) {
    throw new ImportParseError(
      `Row ${rowNumber} needs both season and episode numbers.`,
      "invalid_export",
    );
  }

  const watchedValue = text(row, "watched_at");
  const watchlistedValue = text(row, "watchlisted_at");
  const ratingValue = text(row, "rating");
  const watchedAt = date(watchedValue, true, rowNumber, "watched_at");
  const watchlistedAt = date(watchlistedValue, false, rowNumber, "watchlisted_at");
  const rating = integer(ratingValue, 1, 10);
  const ratedAt = ratingValue
    ? date(text(row, "rated_at"), false, rowNumber, "rated_at")
    : undefined;

  if (rating === null) {
    throw new ImportParseError(`Row ${rowNumber} has a rating outside 1–10.`, "invalid_export");
  }

  if (!watchedValue && !watchlistedValue && rating === undefined) {
    throw new ImportParseError(
      `Row ${rowNumber} needs watched_at, watchlisted_at, or rating.`,
      "invalid_export",
    );
  }

  const mediaType: ImportedActivity["mediaType"] =
    kind === "movie" ? "movie" : kind ? "tv" : undefined;
  const displayTitle = (title || identity).slice(0, 160);
  const providerItemId = (
    imdb ||
    (tmdb ? `tmdb:${tmdb}` : "") ||
    (tvdb ? `tvdb:${tvdb}` : "")
  ).slice(0, 200);
  const common = {
    source,
    sourceSubject: "",
    ...(providerItemId ? { providerItemId } : {}),
    ...(mediaType ? { mediaType } : {}),
    title: displayTitle,
    ...(year !== undefined ? { year } : {}),
    ...(tmdb || imdb || tvdb
      ? {
          externalIds: {
            ...(tmdb ? { tmdb } : {}),
            ...(imdb ? { imdb } : {}),
            ...(tvdb ? { tvdb } : {}),
          },
        }
      : {}),
    ...(season !== undefined ? { season } : {}),
    ...(episode !== undefined ? { episode } : {}),
  };
  const output: ImportedActivity[] = [];

  if (watchedValue) {
    output.push({
      ...common,
      sourceEventId: await sourceEventId([source, identity, "watched", watchedAt, ordinal]),
      eventTypes: ["watched"],
      ...(watchedAt ? { watchedAt } : {}),
    });
  }

  if (watchlistedValue) {
    output.push({
      ...common,
      sourceEventId: await sourceEventId([source, identity, "watchlist", watchlistedAt, ordinal]),
      eventTypes: ["watchlist"],
      ...(watchlistedAt ? { watchedAt: watchlistedAt } : {}),
    });
  }

  if (rating !== undefined) {
    output.push({
      ...common,
      sourceEventId: await sourceEventId([source, identity, "rating", ratedAt, ordinal]),
      eventTypes: watchedValue || watchlistedValue ? ["rated"] : ["watched", "rated"],
      ...(ratedAt ? { watchedAt: ratedAt } : {}),
      rating: Math.max(1, Math.min(5, Math.round(rating / 2))),
    });
  }

  return output;
}

async function buildImport(
  source: "json" | "csv",
  file: ImportFile,
  rows: Record<string, unknown>[],
): Promise<ParsedImport> {
  const records = (
    await Promise.all(rows.map((row, ordinal) => activities(source, row, ordinal)))
  ).flat();

  return {
    source,
    sourceSubject: "",
    inputKind: source === "json" ? "generic_json" : "generic_csv",
    adapterId: `marquee-${source}`,
    adapterVersion: ADAPTER_VERSION,
    inputFingerprint: await importFingerprint(file.text),
    records,
  };
}

export async function parseStructuredJson(file: ImportFile) {
  let value: unknown;

  try {
    value = JSON.parse(file.text);
  } catch {
    throw new ImportParseError("That is not valid JSON.", "invalid_export");
  }

  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new ImportParseError("JSON imports must be an array of objects.", "invalid_export");
  }

  return buildImport("json", file, value);
}

export function parseStructuredCsv(file: ImportFile) {
  const rows = csvObjects(file.text);
  const shape = watchHistoryShape(rows);

  return shape ? parseWatchHistoryCsv(file, rows, shape) : buildImport("csv", file, rows);
}
