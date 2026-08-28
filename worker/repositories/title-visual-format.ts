import type { MediaType, TitleVisualFormat } from "../../src/domain/catalog.ts";
import { insertRows, queryChunked } from "./catalog-array-utils.ts";

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
  const values = writes.flatMap((write) => [
    ...write.colours.map((value) => ({ titleId: write.titleId, kind: "colour", value })),
    ...write.aspectRatios.map((value) => ({ titleId: write.titleId, kind: "aspect_ratio", value })),
  ]);

  await db.batch(
    writes.map((write) =>
      db
        .prepare(`DELETE FROM title_visual_format WHERE title_id = ? AND source = ?`)
        .bind(write.titleId, source),
    ),
  );

  if (values.length > 0) {
    await insertRows(
      db,
      4,
      25,
      values.map((row): unknown[] => [row.titleId, row.kind, row.value, source]),
      (chunk) =>
        `INSERT INTO title_visual_format (title_id, kind, value, source)
         VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}
         ON CONFLICT (title_id, kind, value, source) DO NOTHING`,
    );
  }

  await insertRows(
    db,
    3,
    25,
    writes.map((write): unknown[] => [
      write.titleId,
      source,
      write.colours.length + write.aspectRatios.length,
    ]),
    (chunk) =>
      `INSERT INTO title_visual_format_sync (title_id, source, values_found, checked_at)
       VALUES ${chunk.map(() => "(?, ?, ?, CURRENT_TIMESTAMP)").join(", ")}
       ON CONFLICT (title_id, source) DO UPDATE SET
         values_found = excluded.values_found,
         checked_at = excluded.checked_at`,
  );
}
