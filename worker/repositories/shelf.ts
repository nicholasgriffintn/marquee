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
           END, lower(t.title), e.id`,
  year: "t.year IS NULL, t.year DESC, lower(t.title), e.id",
  genre: `${FIRST_GENRE} IS NULL, lower(${FIRST_GENRE}), lower(t.title), e.id`,
};

const FURTHEST_EPISODE = `viewing_episode_entries
       WHERE viewer_id = e.viewer_id AND title_id = e.title_id
         AND scope = 'episode' AND watched = 1 AND season_number > 0
       ORDER BY season_number DESC, episode_number DESC LIMIT 1`;

const PROGRESS_COLUMNS = `(SELECT season_number FROM ${FURTHEST_EPISODE}) AS season,
                (SELECT episode_number FROM ${FURTHEST_EPISODE}) AS episode`;

function conditions(query: ShelfPageQuery) {
  const where = ["e.viewer_id = $1"];
  const bindings: DatabaseValue[] = [];

  if (query.status) {
    bindings.push(query.status);
    where.push(`e.status = $${bindings.length + 1}`);
  }

  if (query.query) {
    bindings.push(`%${query.query.replaceAll(/[%_]/gu, "")}%`);
    where.push(`t.title ILIKE $${bindings.length + 1}`);
  }

  if (query.genre) {
    bindings.push(query.genre);
    where.push(
      `EXISTS (SELECT 1 FROM catalog_title_genres WHERE title_id = t.id AND genre = $${bindings.length + 1})`,
    );
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

async function toRows(db: Database, rows: JoinedRow[]): Promise<ShelfRow[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.flatMap((title, index) => {
    const row = rows[index];

    return row ? [{ entry: toEntry(row), title: withStoredPoster(title, row.poster_key) }] : [];
  });
}

export async function readShelfPage(db: Database, viewerId: string, query: ShelfPageQuery) {
  const { where, bindings } = conditions(query);
  const limitParameter = bindings.length + 2;
  const offsetParameter = limitParameter + 1;
  const [rows, totals] = await Promise.all([
    db.query<JoinedRow>(
      `SELECT e.id AS "entryId", e.title_id AS "titleId", e.status AS "entryStatus", e.rating, e.thoughts,
                ${PROGRESS_COLUMNS}, e.updated_at AS "updatedAt",
                ${catalogTitleColumns("t")}
           FROM viewing_entries AS e
           JOIN catalog_titles AS t ON t.id = e.title_id
          WHERE ${where}
          ORDER BY ${ORDER_BY[query.sort]}
          LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      [viewerId, ...bindings, query.pageSize, query.page * query.pageSize],
    ),
    db.first<{ matched: number; shelved: number }>(
      `SELECT count(*) AS matched,
                (SELECT count(*) FROM viewing_entries WHERE viewer_id = $1) AS shelved
           FROM viewing_entries AS e
           JOIN catalog_titles AS t ON t.id = e.title_id
          WHERE ${where}`,
      [viewerId, ...bindings],
    ),
  ]);

  const items = await toRows(db, rows.rows);

  return {
    items,
    matched: totals?.matched ?? items.length,
    shelved: totals?.shelved ?? items.length,
  };
}

export async function readShelfGenres(db: Database, viewerId: string) {
  const rows = await db.query<{ genre: string }>(
    `SELECT DISTINCT g.genre AS genre
         FROM viewing_entries AS e
         JOIN catalog_title_genres AS g ON g.title_id = e.title_id
        WHERE e.viewer_id = $1
        ORDER BY lower(g.genre), g.genre`,
    [viewerId],
  );

  return rows.rows.map((row) => row.genre).filter(Boolean);
}

export async function readLostProperty(
  db: Database,
  viewerId: string,
  staleDays: number,
  limit: number,
) {
  const rows = await db.query<JoinedRow>(
    `SELECT e.id AS "entryId", e.title_id AS "titleId", e.status AS "entryStatus", e.rating, e.thoughts,
              ${PROGRESS_COLUMNS}, e.updated_at AS "updatedAt",
              ${catalogTitleColumns("t")}
         FROM viewing_entries AS e
         JOIN catalog_titles AS t ON t.id = e.title_id
        WHERE e.viewer_id = $1
          AND e.status = 'watchlist'
          AND (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400.0) - (EXTRACT(EPOCH FROM e.updated_at) / 86400.0) >= $2
        ORDER BY e.updated_at
        LIMIT $3`,
    [viewerId, staleDays, limit],
  );

  return toRows(db, rows.rows);
}
