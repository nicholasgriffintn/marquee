import type { MediaTitle } from "../../src/domain/catalog.ts";
import { type KindArrayField, readKindArray, writeKindArray } from "./catalog-array-utils.ts";

const FIELD: KindArrayField = {
  table: "catalog_title_languages",
  column: "language",
  kinds: [
    { kind: "general", field: "languages" },
    { kind: "spoken", field: "spokenLanguages" },
  ],
};

export function readLanguageMap(db: Database, ids: string[]) {
  return readKindArray(db, FIELD, ids);
}

export function writeLanguageRows(db: Database, titles: MediaTitle[]) {
  return writeKindArray(
    db,
    FIELD,
    titles.map((title) => ({
      titleId: title.id,
      values: {
        languages: title.languages ?? [],
        spokenLanguages: title.spokenLanguages ?? [],
      },
    })),
  );
}
