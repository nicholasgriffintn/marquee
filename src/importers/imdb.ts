import type { ImportedActivity } from "../domain/imports";
import { csvObjects } from "../lib/csv";
import { importFingerprint, sourceEventId } from "../lib/import-fingerprint";
import { ImportParseError, type ImportFile, type ParsedImport } from "./types";

const ADAPTER_VERSION = 1;

function date(value: string) {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function mediaType(value: string): "movie" | "tv" | undefined {
  if (/tv|series|episode/iu.test(value)) {
    return "tv";
  }

  return /movie|film|short/iu.test(value) ? "movie" : undefined;
}

export async function parseImdb(files: ImportFile[]): Promise<ParsedImport> {
  const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));

  if (csvFiles.length === 0) {
    throw new ImportParseError("Choose your IMDb watchlist or ratings CSV.", "invalid_export");
  }

  const records = (
    await Promise.all(
      csvFiles.map(async (file) => {
        const rows = csvObjects(file.text);
        const ratings =
          file.name.toLowerCase().includes("rating") || rows.some((row) => row["your rating"]);

        return Promise.all(
          // oxlint-disable-next-line no-map-spread -- optional fields stay absent from transport
          rows.map(async (row, ordinal): Promise<ImportedActivity | null> => {
            const imdb = (row.const || row["imdb id"] || "").trim();
            const title = (row["series title"] || row.title || row["original title"] || "").trim();

            if (!/^tt\d{3,12}$/u.test(imdb) || !title) {
              return null;
            }

            const year = Number.parseInt(row.year ?? "", 10);
            const score = Number.parseInt(row["your rating"] ?? row.rating ?? "", 10);
            const occurredAt = date(row["date rated"] || row.created || "");
            const kind = mediaType(row["title type"] ?? "");

            if (ratings && (!Number.isInteger(score) || score < 1 || score > 10)) {
              return null;
            }

            return {
              source: "imdb",
              sourceSubject: "",
              sourceEventId: await sourceEventId([
                ratings ? "ratings" : "watchlist",
                imdb,
                occurredAt,
                ordinal,
              ]),
              eventTypes: ratings ? ["watched", "rated"] : ["watchlist"],
              providerItemId: imdb,
              ...(kind ? { mediaType: kind } : {}),
              title: title.slice(0, 160),
              ...(Number.isInteger(year) ? { year } : {}),
              externalIds: { imdb },
              ...(occurredAt ? { watchedAt: occurredAt } : {}),
              ...(ratings ? { rating: Math.max(1, Math.min(5, Math.round(score / 2))) } : {}),
            };
          }),
        );
      }),
    )
  )
    .flat()
    .filter((record): record is ImportedActivity => record !== null);

  if (records.length === 0) {
    throw new ImportParseError("No IMDb titles were recognised in those files.", "invalid_export");
  }

  return {
    source: "imdb",
    sourceSubject: "",
    inputKind: "official_export",
    adapterId: "imdb-csv",
    adapterVersion: ADAPTER_VERSION,
    inputFingerprint: await importFingerprint(
      csvFiles.map((file) => `${file.name.toLowerCase()}\n${file.text}`).join("\n\u001e\n"),
    ),
    records,
  };
}
