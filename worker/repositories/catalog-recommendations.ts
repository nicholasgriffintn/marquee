import type { MediaTitle } from "../../src/domain/catalog.ts";
import { readSimpleArray, type SimpleArrayField, writeSimpleArray } from "./catalog-array-utils.ts";

const FIELD: SimpleArrayField = {
  table: "catalog_title_recommendation_ids",
  column: "recommended_id",
};

export function readRecommendationMap(db: D1Database, ids: string[]) {
  return readSimpleArray(db, FIELD, ids);
}

export function writeRecommendationRows(db: D1Database, titles: MediaTitle[]) {
  return writeSimpleArray(
    db,
    FIELD,
    titles.map((title) => ({
      titleId: title.id,
      values: title.recommendationIds ?? [],
    })),
  );
}
