import type { MediaType, TitleVisualFormat } from "../../src/domain/catalog.ts";
import { queryChunked } from "./catalog-array-utils.ts";

type FormatRow = { titleId: string; kind: string; value: string };

export type FormatCandidate = { titleId: string; mediaType: MediaType; tmdbId: number };

export type FormatWrite = { titleId: string; colours: string[]; aspectRatios: string[] };

export async function readVisualFormatMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<FormatRow>(
        `SELECT title_id AS "titleId", kind, value
         FROM title_visual_format
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})
         ORDER BY title_id, kind, value`,
        [...wave],
      )
      .then((result) => result.rows),
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

export async function selectFormatCandidates(db: Database, limit: number, retryDays: number) {
  const rows = await db.query<FormatCandidate>(
    `SELECT t.id AS "titleId", t.media_type AS "mediaType", t.tmdb_id AS "tmdbId"
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_visual_format_sync AS s
         ON s.title_id = t.id AND s.source = $1
       WHERE s.title_id IS NULL
          OR (s.values_found = 0 AND s.checked_at < (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL)))
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT $3`,
    ["wikidata", `-${retryDays} days`, limit],
  );

  return rows.rows;
}

export async function writeVisualFormats(db: Database, source: string, writes: FormatWrite[]) {
  for (const write of writes) {
    const values = [
      ...write.colours.map((value) => ["colour", value]),
      ...write.aspectRatios.map((value) => ["aspect_ratio", value]),
    ];

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      await transaction.execute(
        `DELETE FROM title_visual_format WHERE title_id = $1 AND source = $2`,
        [write.titleId, source],
      );

      for (const [kind, value] of values) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO title_visual_format (title_id, kind, value, source)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (title_id, kind, value, source) DO NOTHING`,
          [write.titleId, kind, value, source],
        );
      }

      await transaction.execute(
        `INSERT INTO title_visual_format_sync (title_id, source, values_found, checked_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (title_id, source) DO UPDATE SET
             values_found = excluded.values_found,
             checked_at = excluded.checked_at`,
        [write.titleId, source, values.length],
      );
    });
  }
}
