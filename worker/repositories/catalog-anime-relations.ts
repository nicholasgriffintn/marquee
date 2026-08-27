import type { AnimeLink, AnimeRelation, MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

export async function readAnimeRelationMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, mal_id AS malId, relation, format, title, year
         FROM catalog_title_anime_relations
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, position`,
      )
      .bind(...wave)
      .all<AnimeRelation & { titleId: string }>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, AnimeRelation[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...relation }) => relation),
    );
  }

  return values;
}

export async function writeAnimeRelationRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_relations",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.relations ?? []).map((relation, position): unknown[] => [
      title.id,
      relation.malId,
      relation.relation,
      relation.format,
      relation.title,
      relation.year,
      position,
    ]),
  );

  await insertRows(
    db,
    7,
    12,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_relations (title_id, mal_id, relation, format, title, year, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
  );
}

export async function readAnimeRecommendationMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, mal_id AS value FROM catalog_title_anime_recommendations
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, position`,
      )
      .bind(...wave)
      .all<{ titleId: string; value: number }>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, number[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map((entry) => entry.value),
    );
  }

  return values;
}

export async function writeAnimeRecommendationRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_recommendations",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.recommendations ?? []).map((malId, position): unknown[] => [
      title.id,
      malId,
      position,
    ]),
  );

  await insertRows(
    db,
    3,
    30,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_recommendations (title_id, mal_id, position)
       VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}`,
  );
}

export async function readAnimeLinkMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, name, url FROM catalog_title_anime_links
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, position`,
      )
      .bind(...wave)
      .all<AnimeLink & { titleId: string }>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, AnimeLink[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...link }) => link),
    );
  }

  return values;
}

export async function writeAnimeLinkRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_links",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.links ?? []).map((link, position): unknown[] => [
      title.id,
      link.name,
      link.url,
      position,
    ]),
  );

  await insertRows(
    db,
    4,
    22,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_links (title_id, name, url, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
  );
}
