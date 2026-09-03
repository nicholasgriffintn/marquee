import type { MediaTitle, TitleVideo } from "../../src/domain/catalog.ts";
import { groupBy, insertRows, queryChunked, rowPlaceholders } from "./catalog-array-utils.ts";

type VideoRow = TitleVideo & { titleId: string };

export async function readVideoMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<VideoRow>(
        `SELECT title_id AS "titleId", video_key AS key, name, type, source,
                published_at AS "publishedAt", views
         FROM catalog_title_videos
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})
         ORDER BY title_id, position, published_at DESC NULLS LAST`,
        [...wave],
      )
      .then((result) => result.rows),
  );

  const grouped = groupBy(rows, (row) => row.titleId);
  const values = new Map<string, TitleVideo[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...entry }) => entry),
    );
  }

  return values;
}

async function pruneStaleTmdbVideos(db: Database, titles: MediaTitle[]) {
  for (let index = 0; index < titles.length; index += 100) {
    const wave = titles.slice(index, index + 100);
    const kept = wave.flatMap((title) =>
      (title.videos ?? []).map((video) => `${title.id}|${video.key}`),
    );

    // oxlint-disable-next-line no-await-in-loop
    await db.execute(
      `DELETE FROM catalog_title_videos
       WHERE title_id IN (${wave.map((_, offset) => `$${offset + 2}`).join(",")})
         AND source = 'tmdb'
         AND (title_id || '|' || video_key) NOT IN (
           SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value)
         )`,
      [JSON.stringify(kept), ...wave.map((title) => title.id)],
    );
  }
}

export async function writeVideoRows(db: Database, titles: MediaTitle[]) {
  const rows = titles.flatMap((title) =>
    (title.videos ?? []).map((video, position): DatabaseValue[] => [
      title.id,
      video.key,
      video.name,
      video.type,
      position,
      video.publishedAt ?? null,
    ]),
  );

  await insertRows(
    db,
    6,
    15,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_videos (title_id, video_key, name, type, position, published_at)
       VALUES ${rowPlaceholders(chunk.length, 6)}
       ON CONFLICT (title_id, video_key) DO UPDATE SET
         name = excluded.name, type = excluded.type, position = excluded.position,
         published_at = COALESCE(excluded.published_at, catalog_title_videos.published_at)`,
  );

  await pruneStaleTmdbVideos(db, titles);
}
