import type { MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

export async function readAnimeSynonymMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<{ titleId: string; value: string }>(
        `SELECT title_id AS "titleId", synonym AS value FROM catalog_title_anime_synonyms
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")}) ORDER BY title_id, position`,
        [...wave],
      )
      .then((r) => r.rows),
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

export async function writeAnimeSynonymRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_synonyms",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.synonyms ?? []).map((value, position): DatabaseValue[] => [
      title.id,
      value,
      position,
    ]),
  );

  await insertRows(
    db,
    3,
    30,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_anime_synonyms (title_id, synonym, position)
       VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}
       ON CONFLICT DO NOTHING`,
  );
}

type CompanyRow = {
  titleId: string;
  kind: "licensor" | "producer";
  name: string;
};

export async function readAnimeCompanyMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<CompanyRow>(
        `SELECT title_id AS "titleId", kind, name FROM catalog_title_anime_companies
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")}) ORDER BY title_id, kind, position`,
        [...wave],
      )
      .then((r) => r.rows),
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

export async function writeAnimeCompanyRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_companies",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) => [
    ...(title.anime?.licensors ?? []).map((name, position): DatabaseValue[] => [
      title.id,
      "licensor",
      name,
      position,
    ]),
    ...(title.anime?.producers ?? []).map((name, position): DatabaseValue[] => [
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
      `INSERT INTO catalog_title_anime_companies (title_id, kind, name, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}
       ON CONFLICT DO NOTHING`,
  );
}
