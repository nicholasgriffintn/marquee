import type { MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

type VideoRow = { titleId: string; key: string; name: string; type: string };

export async function readVideoMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<VideoRow>(
        `SELECT title_id AS "titleId", video_key AS key, name, type
         FROM catalog_title_videos
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})
         ORDER BY title_id, position`,
        [...wave],
      )
      .then((result) => result.rows),
  );

  const grouped = groupBy(rows, (row) => row.titleId);
  const values = new Map<string, Omit<VideoRow, "titleId">[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...entry }) => entry),
    );
  }

  return values;
}

export async function writeVideoRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_videos",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.videos ?? []).map((video, position): DatabaseValue[] => [
      title.id,
      video.key,
      video.name,
      video.type,
      position,
    ]),
  );

  await insertRows(
    db,
    5,
    18,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_videos (title_id, video_key, name, type, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (title_id, video_key) DO UPDATE SET
         name = excluded.name, type = excluded.type, position = excluded.position`,
  );
}
