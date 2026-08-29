import type { MediaTitle } from "../../src/domain/catalog.ts";
import { type KindArrayField, readKindArray, writeKindArray } from "./catalog-array-utils.ts";

const FIELD: KindArrayField = {
  table: "catalog_title_countries",
  column: "country",
  kinds: [
    { kind: "general", field: "countries" },
    { kind: "origin", field: "originCountries" },
    { kind: "production", field: "productionCountries" },
  ],
};

export function readCountryMap(db: Database, ids: string[]) {
  return readKindArray(db, FIELD, ids);
}

export function writeCountryRows(db: Database, titles: MediaTitle[]) {
  return writeKindArray(
    db,
    FIELD,
    titles.map((title) => ({
      titleId: title.id,
      values: {
        countries: title.countries ?? [],
        originCountries: title.originCountries ?? [],
        productionCountries: title.productionCountries ?? [],
      },
    })),
  );
}
