import type { MediaType, TitleForm } from "../../src/domain/catalog.ts";
import { insertRows, queryChunked } from "./catalog-array-utils.ts";

type FormRow = { titleId: string; colour: string | null; aspectRatio: string | null };

export type FormCandidate = { titleId: string; mediaType: MediaType; tmdbId: number };

export async function readTitleFormMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, colour, aspect_ratio AS aspectRatio
         FROM title_form
         WHERE title_id IN (${wave.map(() => "?").join(",")})
           AND (colour IS NOT NULL OR aspect_ratio IS NOT NULL)`,
      )
      .bind(...wave)
      .all<FormRow>()
      .then((result) => result.results),
  );

  return new Map(rows.map(({ titleId, ...form }): [string, TitleForm] => [titleId, form]));
}

export async function selectFormCandidates(db: D1Database, limit: number, retryDays: number) {
  const rows = await db
    .prepare(
      `SELECT t.id AS titleId, t.media_type AS mediaType, t.tmdb_id AS tmdbId
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_form AS f ON f.title_id = t.id
       WHERE f.title_id IS NULL
          OR (f.colour IS NULL AND f.aspect_ratio IS NULL
              AND f.checked_at < datetime('now', ?1))
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT ?2`,
    )
    .bind(`-${retryDays} days`, limit)
    .all<FormCandidate>();

  return rows.results;
}

export async function writeTitleForms(db: D1Database, forms: FormRow[]) {
  await insertRows(
    db,
    3,
    25,
    forms.map((form): unknown[] => [form.titleId, form.colour, form.aspectRatio]),
    (chunk) =>
      `INSERT INTO title_form (title_id, colour, aspect_ratio, checked_at)
       VALUES ${chunk.map(() => "(?, ?, ?, CURRENT_TIMESTAMP)").join(", ")}
       ON CONFLICT (title_id) DO UPDATE SET
         colour = excluded.colour,
         aspect_ratio = excluded.aspect_ratio,
         checked_at = excluded.checked_at`,
  );
}
