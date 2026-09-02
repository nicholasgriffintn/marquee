import type { ImportedActivity } from "../domain/imports";
import { parseSlashDate, slashDatesAreDayFirst } from "../lib/dates";
import { importFingerprint, sourceEventId } from "../lib/import-fingerprint";
import { normaliseTitle } from "../lib/string";
import { ImportParseError, type ImportFile, type ParsedImport } from "./types";

const ADAPTER_VERSION = 1;
const DATED_ROW_SHARE = 0.5;

const TITLE_KEYS = new Set(["title", "name", "show", "video title", "program", "programme"]);
const DATE_KEYS = new Set([
  "date",
  "watched",
  "date watched",
  "watched date",
  "last watched date",
  "start time",
  "timestamp",
]);
const PORTABLE_KEYS = new Set([
  "imdb_id",
  "tmdb_id",
  "tvdb_id",
  "type",
  "watched_at",
  "watchlisted_at",
  "rating",
]);

const SEASON_MARKER =
  /^(?:limited series|miniseries|season|series|volume|part|chapter|book|collection)\s*(\d+)?\b/iu;

export type WatchHistoryShape = { titleKey: string; dateKey: string };

type WatchHistoryTitle = { title: string; mediaType?: "tv"; season?: number };

export function watchHistoryShape(rows: Record<string, string>[]): WatchHistoryShape | null {
  const [first] = rows;

  if (!first) {
    return null;
  }

  const keys = Object.keys(first);

  if (keys.some((key) => PORTABLE_KEYS.has(key))) {
    return null;
  }

  const titleKey = keys.find((key) => TITLE_KEYS.has(key));
  const dateKey = keys.find((key) => DATE_KEYS.has(key));

  return titleKey && dateKey ? { titleKey, dateKey } : null;
}

function numberedSeason(segment: string) {
  const digits = SEASON_MARKER.exec(segment)?.[1];
  const parsed = Number(digits);

  return digits && Number.isInteger(parsed) && parsed <= 100 ? parsed : undefined;
}

function seriesWithNumberedSeason(series: string, segment: string): WatchHistoryTitle | null {
  const season = numberedSeason(segment);

  return season === undefined ? null : { title: series, mediaType: "tv" as const, season };
}

export function splitWatchHistoryTitle(raw: string): WatchHistoryTitle {
  const segments = raw
    .split(/:\s+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const [series = raw.trim(), ...rest] = segments;

  if (rest.length === 0) {
    return { title: series };
  }

  if (rest.length === 1) {
    return seriesWithNumberedSeason(series, rest[0] ?? "") ?? { title: raw.trim() };
  }

  const season = rest.reduce<number | undefined>(
    (found, segment) => found ?? numberedSeason(segment),
    undefined,
  );

  return {
    title: series,
    mediaType: "tv" as const,
    ...(season === undefined ? {} : { season }),
  };
}

function watchedAt(value: string, dayFirst: boolean) {
  const slash = parseSlashDate(value, dayFirst);

  if (slash) {
    return slash.toISOString();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function parseWatchHistoryCsv(
  file: ImportFile,
  rows: Record<string, string>[],
  shape: WatchHistoryShape,
): Promise<ParsedImport> {
  const dates = rows.map((row) => row[shape.dateKey] ?? "");
  const dayFirst = slashDatesAreDayFirst(dates);
  const rewatchesOfSameDay = new Map<string, number>();
  const drafts = rows.flatMap((row, index) => {
    const raw = (row[shape.titleKey] ?? "").trim();
    const occurredAt = watchedAt(dates[index] ?? "", dayFirst);

    if (!raw || !occurredAt) {
      return [];
    }

    const key = `${raw}${occurredAt}`;
    const rewatch = rewatchesOfSameDay.get(key) ?? 0;

    rewatchesOfSameDay.set(key, rewatch + 1);

    return [{ raw, occurredAt, rewatch, ...splitWatchHistoryTitle(raw) }];
  });

  if (drafts.length < rows.length * DATED_ROW_SHARE) {
    throw new ImportParseError(
      `Most rows in that file have no readable ${shape.dateKey}.`,
      "invalid_export",
    );
  }

  const records = await Promise.all(
    // oxlint-disable-next-line no-map-spread -- optional fields stay absent from transport
    drafts.map(async (draft): Promise<ImportedActivity> => {
      const seriesKey = normaliseTitle(draft.title);

      return {
        source: "csv",
        sourceSubject: "",
        sourceEventId: await sourceEventId([
          "csv-watch",
          draft.raw,
          draft.occurredAt,
          draft.rewatch,
        ]),
        eventTypes: ["watched"],
        ...(seriesKey ? { providerItemId: `title:${seriesKey}`.slice(0, 200) } : {}),
        ...(draft.mediaType ? { mediaType: draft.mediaType } : {}),
        title: draft.title.slice(0, 160),
        ...(draft.season === undefined ? {} : { season: draft.season }),
        watchedAt: draft.occurredAt,
      };
    }),
  );

  return {
    source: "csv",
    sourceSubject: "",
    inputKind: "generic_csv",
    adapterId: "watch-history-csv",
    adapterVersion: ADAPTER_VERSION,
    inputFingerprint: await importFingerprint(file.text),
    records,
  };
}
