import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { ShelfSort } from "../../src/domain/shelf.ts";
import type { EntryStatus, ViewingEntry } from "../../src/types.ts";
import { parseStoredTitle } from "../lib/catalog-payload.ts";

export type ShelfPageQuery = {
  status: EntryStatus | null;
  genre: string | null;
  query: string;
  sort: ShelfSort;
  page: number;
  pageSize: number;
};

export type ShelfRow = { entry: ViewingEntry; title: MediaTitle };

type JoinedRow = {
  id: string;
  titleId: string;
  status: string;
  rating: number | null;
  thoughts: string | null;
  season: number | null;
  episode: number | null;
  updatedAt: string;
  payload: string;
  posterKey: string | null;
};

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
  genre: `json_extract(t.payload, '$.genres[0]') IS NULL,
          json_extract(t.payload, '$.genres[0]') COLLATE NOCASE,
          t.title COLLATE NOCASE, e.id`,
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
    where.push(`EXISTS (SELECT 1 FROM json_each(t.payload, '$.genres') WHERE json_each.value = ?)`);
    bindings.push(query.genre);
  }

  return { where: where.join(" AND "), bindings };
}

function toRow(row: JoinedRow): ShelfRow | null {
  const title = parseStoredTitle(row.payload);

  if (!title) {
    return null;
  }

  return {
    entry: {
      id: row.id,
      titleId: row.titleId,
      status: row.status as EntryStatus,
      rating: row.rating,
      thoughts: row.thoughts ?? "",
      season: row.season,
      episode: row.episode,
      updatedAt: row.updatedAt,
    },
    title: row.posterKey ? { ...title, posterUrl: `/media/${row.posterKey}` } : title,
  };
}

export async function readShelfPage(db: D1Database, viewerId: string, query: ShelfPageQuery) {
  const { where, bindings } = conditions(query);
  const [rows, totals] = await Promise.all([
    db
      .prepare(
        `SELECT e.id, e.title_id AS titleId, e.status, e.rating, e.thoughts,
                ${PROGRESS_COLUMNS}, e.updated_at AS updatedAt,
                t.payload, t.poster_key AS posterKey
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

  const items = rows.results.flatMap((row) => {
    const parsed = toRow(row);

    return parsed ? [parsed] : [];
  });

  return {
    items,
    matched: totals?.matched ?? items.length,
    shelved: totals?.shelved ?? items.length,
  };
}

export async function readShelfGenres(db: D1Database, viewerId: string) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT json_each.value AS genre
         FROM viewing_entries AS e
         JOIN catalog_titles AS t ON t.id = e.title_id,
              json_each(t.payload, '$.genres')
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
      `SELECT e.id, e.title_id AS titleId, e.status, e.rating, e.thoughts,
              ${PROGRESS_COLUMNS}, e.updated_at AS updatedAt,
              t.payload, t.poster_key AS posterKey
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

  return rows.results.flatMap((row) => {
    const parsed = toRow(row);

    return parsed ? [parsed] : [];
  });
}
