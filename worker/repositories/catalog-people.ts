import type { MediaTitle } from "../../src/domain/catalog.ts";
import { readSimpleArray, type SimpleArrayField, writeSimpleArray } from "./catalog-array-utils.ts";

const FIELD: SimpleArrayField = {
  table: "catalog_title_people",
  column: "person",
};

export function readPersonMap(db: Database, ids: string[]) {
  return readSimpleArray(db, FIELD, ids);
}

export function writePersonRows(db: Database, titles: MediaTitle[]) {
  return writeSimpleArray(
    db,
    FIELD,
    titles.map((title) => ({ titleId: title.id, values: title.people ?? [] })),
  );
}
