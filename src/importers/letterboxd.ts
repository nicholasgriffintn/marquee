import type { ImportedActivity } from "../domain/imports";
import { csvObjects } from "../lib/csv";
import { importFingerprint, sourceEventId } from "../lib/import-fingerprint";
import { normaliseTitle } from "../lib/string";
import { readZipEntries, readZipEntry } from "../lib/zip";
import type { ImportFile, ParsedImport } from "./types";

const ADAPTER_VERSION = 1;
const CSV_LIMIT = 10 * 1024 * 1024;
const LETTERBOXD_FILES = new Set(["diary.csv", "ratings.csv", "watched.csv", "watchlist.csv"]);

async function letterboxdFiles(files: ImportFile[]) {
  const archive = files.find((file) => file.name.toLowerCase().endsWith(".zip"));

  if (!archive) {
    return files;
  }

  if (!archive.data) {
    throw new Error("That Letterboxd ZIP could not be opened.");
  }

  const archiveData = archive.data;
  const decoder = new TextDecoder();
  const entries = readZipEntries(archiveData).filter(
    (entry) => !entry.name.includes("/") && LETTERBOXD_FILES.has(entry.name.toLowerCase()),
  );

  return Promise.all(
    entries.map(async (entry) => ({
      name: entry.name,
      text: decoder.decode(await readZipEntry(archiveData, entry, CSV_LIMIT)),
    })),
  );
}

function date(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00.000Z` : undefined;
}

function rating(value: string) {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(5, Math.max(1, Math.round(parsed)))
    : undefined;
}

function eventTypes(fileName: string, score?: number): ImportedActivity["eventTypes"] {
  if (fileName === "watchlist.csv") {
    return ["watchlist"];
  }

  if (fileName === "ratings.csv") {
    return score ? ["rated"] : [];
  }

  return score ? ["watched", "rated"] : ["watched"];
}

function activityDate(fileName: string, row: Record<string, string>) {
  if (fileName === "diary.csv") {
    return date(row["watched date"] ?? "");
  }

  return fileName === "watched.csv" ? undefined : date(row.date ?? "");
}

export async function parseLetterboxd(files: ImportFile[]): Promise<ParsedImport> {
  const supported = (await letterboxdFiles(files)).filter((file) =>
    LETTERBOXD_FILES.has(file.name.toLowerCase()),
  );
  const diaryKeys = new Set(
    supported
      .filter((file) => file.name.toLowerCase() === "diary.csv")
      .flatMap((file) =>
        csvObjects(file.text).map(
          (row) => `${normaliseTitle(row.name ?? "")}\u001f${row.year ?? ""}`,
        ),
      ),
  );
  const records = (
    await Promise.all(
      supported.map(async (file) => {
        const fileName = file.name.toLowerCase();
        const rows = csvObjects(file.text);

        return Promise.all(
          // oxlint-disable-next-line no-map-spread -- optional fields stay absent from transport
          rows.map(async (row, ordinal): Promise<ImportedActivity | null> => {
            const title = row.name?.trim() ?? "";

            if (!title) {
              return null;
            }

            const year = Number.parseInt(row.year ?? "", 10);
            const watchedAt = activityDate(fileName, row);
            const score = rating(row.rating ?? "");
            const providerItemId = row["letterboxd uri"] || row.uri || undefined;
            const titleKey = `${normaliseTitle(title)}\u001f${row.year ?? ""}`;
            const types = eventTypes(fileName, score);

            if ((fileName === "watched.csv" && diaryKeys.has(titleKey)) || types.length === 0) {
              return null;
            }

            return {
              source: "letterboxd",
              sourceSubject: "",
              sourceEventId: await sourceEventId([
                fileName,
                providerItemId,
                title,
                Number.isInteger(year) ? year : null,
                watchedAt,
                ordinal,
              ]),
              eventTypes: types,
              ...(providerItemId ? { providerItemId } : {}),
              mediaType: "movie",
              title: title.slice(0, 160),
              ...(Number.isInteger(year) ? { year } : {}),
              ...(watchedAt ? { watchedAt } : {}),
              ...(score ? { rating: score } : {}),
            };
          }),
        );
      }),
    )
  )
    .flat()
    .filter((record): record is ImportedActivity => record !== null);

  return {
    source: "letterboxd",
    sourceSubject: "",
    inputKind: "official_export",
    adapterId: "letterboxd-csv",
    adapterVersion: ADAPTER_VERSION,
    inputFingerprint: await importFingerprint(
      supported.map((file) => `${file.name.toLowerCase()}\n${file.text}`).join("\n\u001e\n"),
    ),
    records,
  };
}
