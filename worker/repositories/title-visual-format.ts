import type { MediaType, TitleVisualFormat } from "../../src/domain/catalog.ts";
import { queryChunked } from "./catalog-array-utils.ts";

const WRITE_CHUNK = 60;

type FormatRow = { titleId: string; kind: string; value: string };

export type FormatCandidate = { titleId: string; mediaType: MediaType; tmdbId: number };

export type FormatWrite = { titleId: string; colours: string[]; aspectRatios: string[] };

export async function readVisualFormatMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, kind, value
         FROM title_visual_format
         WHERE title_id IN (${wave.map(() => "?").join(",")})
         ORDER BY title_id, kind, value`,
      )
      .bind(...wave)
      .all<FormatRow>()
      .then((result) => result.results),
  );
  const formats = new Map<string, TitleVisualFormat>();

  for (const row of rows) {
    const format = formats.get(row.titleId) ?? { colours: [], aspectRatios: [] };
    const bucket = row.kind === "colour" ? format.colours : format.aspectRatios;

    if (!bucket.includes(row.value)) {
      bucket.push(row.value);
    }

    formats.set(row.titleId, format);
  }

  return formats;
}

export async function selectFormatCandidates(db: D1Database, limit: number, retryDays: number) {
  const rows = await db
    .prepare(
      `SELECT t.id AS titleId, t.media_type AS mediaType, t.tmdb_id AS tmdbId
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_visual_format_sync AS s
         ON s.title_id = t.id AND s.source = ?1
       WHERE s.title_id IS NULL
          OR (s.values_found = 0 AND s.checked_at < datetime('now', ?2))
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT ?3`,
    )
    .bind("wikidata", `-${retryDays} days`, limit)
    .all<FormatCandidate>();

  return rows.results;
}

export async function writeVisualFormats(db: D1Database, source: string, writes: FormatWrite[]) {
  const statements = writes.flatMap((write) => {
    const values = [
      ...write.colours.map((value) => ["colour", value]),
      ...write.aspectRatios.map((value) => ["aspect_ratio", value]),
    ];

    return [
      db
        .prepare(`DELETE FROM title_visual_format WHERE title_id = ? AND source = ?`)
        .bind(write.titleId, source),
      ...values.map(([kind, value]) =>
        db
          .prepare(
            `INSERT INTO title_visual_format (title_id, kind, value, source)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (title_id, kind, value, source) DO NOTHING`,
          )
          .bind(write.titleId, kind, value, source),
      ),
      db
        .prepare(
          `INSERT INTO title_visual_format_sync (title_id, source, values_found, checked_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (title_id, source) DO UPDATE SET
             values_found = excluded.values_found,
             checked_at = excluded.checked_at`,
        )
        .bind(write.titleId, source, values.length),
    ];
  });

  for (let index = 0; index < statements.length; index += WRITE_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(statements.slice(index, index + WRITE_CHUNK));
  }
}
