import type { ImportSource } from "../domain/imports";
import { parseImdb } from "./imdb";
import { parseLetterboxd } from "./letterboxd";
import { parseStructuredCsv, parseStructuredJson } from "./structured";
import { ImportParseError, type ImportFile, type ParsedImport } from "./types";

const FILE_LIMIT = 25 * 1024 * 1024;

export type ImportChoice = {
  id: ImportSource;
  label: string;
  description: string;
  mode: "files" | "connection";
  accept?: string;
  multiple?: boolean;
};

export const IMPORT_CHOICES: ImportChoice[] = [
  {
    id: "imdb",
    label: "IMDb",
    description: "Import an exported watchlist, ratings, or both.",
    mode: "files",
    accept: ".csv,text/csv",
    multiple: true,
  },
  {
    id: "letterboxd",
    label: "Letterboxd",
    description: "Upload the ZIP downloaded from Letterboxd settings.",
    mode: "files",
    accept: ".zip,application/zip",
  },
  {
    id: "trakt",
    label: "Trakt",
    description: "Connect Trakt and bring over history, ratings, and watchlist.",
    mode: "connection",
  },
  {
    id: "json",
    label: "JSON",
    description: "Use Marquee's documented portable JSON format.",
    mode: "files",
    accept: ".json,application/json",
  },
  {
    id: "csv",
    label: "CSV",
    description: "Use the same portable fields in a spreadsheet-friendly file.",
    mode: "files",
    accept: ".csv,text/csv",
  },
];

export async function readImportFiles(files: FileList | File[]) {
  const selected = [...files];

  if (selected.some((file) => file.size > FILE_LIMIT)) {
    throw new ImportParseError("Each import file must be 25 MB or smaller.", "import_too_large");
  }

  return Promise.all(
    selected.map(async (file): Promise<ImportFile> =>
      file.name.toLowerCase().endsWith(".zip")
        ? { name: file.name, text: "", data: await file.arrayBuffer() }
        : { name: file.name, text: await file.text() },
    ),
  );
}

export async function parseImportFiles(
  source: ImportSource,
  files: ImportFile[],
): Promise<ParsedImport> {
  const [file] = files;

  if (!file) {
    throw new ImportParseError("Choose an export first.", "invalid_export");
  }

  if (source === "imdb") {
    return parseImdb(files);
  }

  if (source === "letterboxd") {
    return parseLetterboxd(files);
  }

  if (source === "json") {
    return parseStructuredJson(file);
  }

  if (source === "csv") {
    return parseStructuredCsv(file);
  }

  throw new ImportParseError("That source does not use a file import.", "unsupported_payload");
}
