import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { ShelfSort } from "../../src/domain/shelf.ts";
import type { EntryStatus, ViewingEntry } from "../../src/types.ts";
import {
  catalogTitleColumns,
  type CatalogTitleRow,
  withStoredPoster,
} from "../lib/catalog-payload.ts";
import { hydrateTitleRows } from "./catalog-arrays.ts";

export type ShelfPageQuery = {
  status: EntryStatus | null;
  genre: string | null;
  query: string;
  sort: ShelfSort;
  page: number;
  pageSize: number;
};

export type ShelfRow = { entry: ViewingEntry; title: MediaTitle };

type JoinedRow = CatalogTitleRow & {
  entryId: string;
  titleId: string;
  entryStatus: string;
  rating: number | null;
  thoughts: string | null;
  season: number | null;
  episode: number | null;
  updatedAt: string;
};

const FIRST_GENRE = `(SELECT genre FROM catalog_title_genres WHERE title_id = t.id AND position = 0)`;

const ORDER_BY: Record<ShelfSort, string> = {
  added: "e.updated_at DESC, e.id",
  rating: "e.rating IS NULL, e.rating DESC, e.updated_at DESC, e.id",
  status: `CASE e.status
             WHEN 'watching' THEN 0
             WHEN 'watchlist' THEN 1
             WHEN 'watched' THEN 2
             ELSE 3
           END, t.title COLLATE NOCASE, e.id`,
  year: "t.year IS NULL, t.year DESC, t.title COLLATE NOCASE, e.id",
  genre: `${FIRST_GENRE} IS NULL, ${FIRST_GENRE} COLLATE NOCASE, t.title COLLATE NOCASE, e.id`,
};

const FURTHEST_EPISODE = `viewing_episode_entries
       WHERE viewer_id = e.viewer_id AND title_id = e.title_id
         AND scope = 'episode' AND watched = 1 AND season_number > 0
       ORDER BY season_number DESC, episode_number DESC LIMIT 1`;

const PROGRESS_COLUMNS = `(SELECT season_number FROM ${FURTHEST_EPISODE}) AS season,
                (SELECT episode_number FROM ${FURTHEST_EPISODE}) AS episode`;

function conditions(query: ShelfPageQuery) {
  const where = ["e.viewer_id = ?"];
  const bindings: unknown[] = [];

  if (query.status) {
    where.push("e.status = ?");
    bindings.push(query.status);
  }

  if (query.query) {
    where.push("t.title LIKE ? COLLATE NOCASE");
    bindings.push(`%${query.query.replaceAll(/[%_]/gu, "")}%`);
  }

  if (query.genre) {
    where.push(`EXISTS (SELECT 1 FROM catalog_title_genres WHERE title_id = t.id AND genre = ?)`);
    bindings.push(query.genre);
  }

  return { where: where.join(" AND "), bindings };
}

function toEntry(row: JoinedRow) {
  return {
    id: row.entryId,
    titleId: row.titleId,
    status: row.entryStatus as EntryStatus,
    rating: row.rating,
    thoughts: row.thoughts ?? "",
    season: row.season,
    episode: row.episode,
    updatedAt: row.updatedAt,
  };
}

async function toRows(db: D1Database, rows: JoinedRow[]): Promise<ShelfRow[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.flatMap((title, index) => {
    const row = rows[index];

    return row ? [{ entry: toEntry(row), title: withStoredPoster(title, row.poster_key) }] : [];
  });
}

export async function readShelfPage(db: D1Database, viewerId: string, query: ShelfPageQuery) {
  const { where, bindings } = conditions(query);
  const [rows, totals] = await Promise.all([
    db
      .prepare(
        `SELECT e.id AS entryId, e.title_id AS titleId, e.status AS entryStatus, e.rating, e.thoughts,
                ${PROGRESS_COLUMNS}, e.updated_at AS updatedAt,
                ${catalogTitleColumns("t")}
           FROM viewing_entries AS e
           JOIN catalog_titles AS t ON t.id = e.title_id
          WHERE ${where}
          ORDER BY ${ORDER_BY[query.sort]}
          LIMIT ? OFFSET ?`,
      )
      .bind(viewerId, ...bindings, query.pageSize, query.page * query.pageSize)
      .all<JoinedRow>(),
    db
      .prepare(
        `SELECT count(*) AS matched,
                (SELECT count(*) FROM viewing_entries WHERE viewer_id = ?) AS shelved
           FROM viewing_entries AS e
           JOIN catalog_titles AS t ON t.id = e.title_id
          WHERE ${where}`,
      )
      .bind(viewerId, viewerId, ...bindings)
      .first<{ matched: number; shelved: number }>(),
  ]);

  const items = await toRows(db, rows.results);

  return {
    items,
    matched: totals?.matched ?? items.length,
    shelved: totals?.shelved ?? items.length,
  };
}

export async function readShelfGenres(db: D1Database, viewerId: string) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT g.genre AS genre
         FROM viewing_entries AS e
         JOIN catalog_title_genres AS g ON g.title_id = e.title_id
        WHERE e.viewer_id = ?
        ORDER BY genre COLLATE NOCASE`,
    )
    .bind(viewerId)
    .all<{ genre: string }>();

  return rows.results.map((row) => row.genre).filter(Boolean);
}

export async function readLostProperty(
  db: D1Database,
  viewerId: string,
  staleDays: number,
  limit: number,
) {
  const rows = await db
    .prepare(
      `SELECT e.id AS entryId, e.title_id AS titleId, e.status AS entryStatus, e.rating, e.thoughts,
              ${PROGRESS_COLUMNS}, e.updated_at AS updatedAt,
              ${catalogTitleColumns("t")}
         FROM viewing_entries AS e
         JOIN catalog_titles AS t ON t.id = e.title_id
        WHERE e.viewer_id = ?
          AND e.status = 'watchlist'
          AND julianday('now') - julianday(e.updated_at) >= ?
        ORDER BY e.updated_at
        LIMIT ?`,
    )
    .bind(viewerId, staleDays, limit)
    .all<JoinedRow>();

  return toRows(db, rows.results);
}
