import type { TitleVideo } from "../../src/domain/catalog.ts";
import type { TrailerSort } from "../../src/domain/trailers.ts";
import type { KinoCheckTrailer } from "../clients/kinocheck.ts";
import { insertRows, rowPlaceholders } from "./catalog-array-utils.ts";

export const TRAILER_WINDOW_DAYS = 60;
const TRAILER_TYPES = ["Trailer", "Teaser"];

export type RecentTrailerRow = TitleVideo & { titleId: string; publishedAt: string };

function trailerTypeList() {
  return TRAILER_TYPES.map((type) => `'${type}'`).join(",");
}

export async function writeTrailerRows(db: Database, trailers: KinoCheckTrailer[]) {
  const rows = trailers.map((trailer): DatabaseValue[] => [
    trailer.titleId,
    trailer.key,
    trailer.name,
    trailer.type,
    0,
    "kinocheck",
    trailer.publishedAt,
    trailer.views,
  ]);

  await insertRows(
    db,
    8,
    12,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_videos
         (title_id, video_key, name, type, position, source, published_at, views)
       VALUES ${rowPlaceholders(chunk.length, 8)}
       ON CONFLICT (title_id, video_key) DO UPDATE SET
         source = 'kinocheck',
         published_at = COALESCE(catalog_title_videos.published_at, excluded.published_at),
         views = GREATEST(COALESCE(catalog_title_videos.views, 0), excluded.views)`,
  );
}

export async function readKnownTitleIds(db: Database, titleIds: string[]) {
  if (titleIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db.query<{ id: string }>(
    `SELECT id FROM catalog_titles
     WHERE id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))`,
    [JSON.stringify(titleIds)],
  );

  return new Set(rows.rows.map((row) => row.id));
}

export async function readRecentTrailers(db: Database, sort: TrailerSort, limit: number) {
  const order =
    sort === "trending"
      ? `views DESC NULLS LAST, "publishedAt" DESC`
      : `"publishedAt" DESC, views DESC NULLS LAST`;
  const rows = await db.query<RecentTrailerRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (v.title_id)
              v.title_id AS "titleId", v.video_key AS key, v.name, v.type, v.source,
              v.published_at AS "publishedAt", v.views
         FROM catalog_title_videos AS v
         JOIN catalog_titles AS t ON t.id = v.title_id
        WHERE v.published_at >= (CURRENT_TIMESTAMP - CAST($1 AS INTERVAL))
          AND v.type IN (${trailerTypeList()})
        ORDER BY v.title_id, v.published_at DESC
     ) AS latest
     ORDER BY ${order}
     LIMIT $2`,
    [`${TRAILER_WINDOW_DAYS} days`, limit],
  );

  return rows.rows;
}

export async function readRecentTrailerTitleIds(db: Database, days: number, limit: number) {
  const rows = await db.query<{ id: string }>(
    `SELECT title_id AS id
       FROM catalog_title_videos
      WHERE published_at >= (CURRENT_TIMESTAMP - CAST($1 AS INTERVAL))
        AND type IN (${trailerTypeList()})
      GROUP BY title_id
      ORDER BY max(published_at) DESC
      LIMIT $2`,
    [`${days} days`, limit],
  );

  return rows.rows.map((row) => row.id);
}
