import type { ImportSource } from "../domain/imports";
import type { ImportFile, ParsedImport } from "./types";

export type ImportWorkerRequest = {
  id: string;
  source: ImportSource;
  files: ImportFile[];
};

export type ImportWorkerResponse =
  | { id: string; ok: true; parsed: ParsedImport }
  | { id: string; ok: false; error: string };
