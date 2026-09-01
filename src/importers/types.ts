import type { ImportedActivity, ImportInputKind, ImportSource } from "../domain/imports";

export type ParsedImport = {
  source: ImportSource;
  sourceSubject: string;
  inputKind: ImportInputKind;
  adapterId: string;
  adapterVersion: number;
  inputFingerprint: string;
  records: ImportedActivity[];
};

export type ImportFile = { name: string; text: string; data?: ArrayBuffer };

export class ImportParseError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_export" | "unsupported_payload" | "import_too_large",
  ) {
    super(message);
    this.name = "ImportParseError";
  }
}
