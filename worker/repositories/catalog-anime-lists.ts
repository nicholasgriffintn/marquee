import type { MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

export async function readAnimeSynonymMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, synonym AS value FROM catalog_title_anime_synonyms
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, position`,
      )
      .bind(...wave)
      .all<{ titleId: string; value: string }>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, string[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map((entry) => entry.value),
    );
  }

  return values;
}

export async function writeAnimeSynonymRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_synonyms",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.synonyms ?? []).map((value, position): unknown[] => [title.id, value, position]),
  );

  await insertRows(
    db,
    3,
    30,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_synonyms (title_id, synonym, position)
       VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}`,
  );
}

type CompanyRow = {
  titleId: string;
  kind: "licensor" | "producer";
  name: string;
};

export async function readAnimeCompanyMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, kind, name FROM catalog_title_anime_companies
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, kind, position`,
      )
      .bind(...wave)
      .all<CompanyRow>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, { licensors: string[]; producers: string[] }>();

  for (const [titleId, entries] of grouped) {
    values.set(titleId, {
      licensors: entries.filter((entry) => entry.kind === "licensor").map((entry) => entry.name),
      producers: entries.filter((entry) => entry.kind === "producer").map((entry) => entry.name),
    });
  }

  return values;
}

export async function writeAnimeCompanyRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_companies",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) => [
    ...(title.anime?.licensors ?? []).map((name, position): unknown[] => [
      title.id,
      "licensor",
      name,
      position,
    ]),
    ...(title.anime?.producers ?? []).map((name, position): unknown[] => [
      title.id,
      "producer",
      name,
      position,
    ]),
  ]);

  await insertRows(
    db,
    4,
    22,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_companies (title_id, kind, name, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
  );
}
