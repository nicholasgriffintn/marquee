import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";

const CREDIT_LIMIT = 400_000;

export const PERSON_CREDITS = `SELECT
       json_extract(credit.value, '$.id') AS personId,
       json_extract(credit.value, '$.name') AS personName,
       catalog_titles.id AS titleId
     FROM catalog_titles, json_each(payload, '$.credits') AS credit
     WHERE json_valid(payload)
       AND json_extract(credit.value, '$.id') IS NOT NULL`;

export type PersonRecord = { personId: number; name: string; titles: number };

export async function rebuildPersonTitles(db: D1Database) {
  await db.prepare(`DELETE FROM catalog_person_titles`).run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO catalog_person_titles (person_id, title_id)
       SELECT personId, titleId
       FROM (${PERSON_CREDITS})
       WHERE personId IN (SELECT person_id FROM catalog_people)
       LIMIT ${CREDIT_LIMIT}`,
    )
    .run();

  const total = await db
    .prepare(`SELECT count(*) AS credits FROM catalog_person_titles`)
    .first<{ credits: number }>();

  return total?.credits ?? 0;
}

export async function readPerson(db: D1Database, name: string): Promise<PersonRecord | null> {
  const term = name.trim().toLowerCase();

  if (term.length < 2 || term.length > 120) {
    return null;
  }

  try {
    const row = await db
      .prepare(
        `SELECT person_id AS personId, name, titles
         FROM catalog_people
         WHERE lower(name) = ?1
         ORDER BY titles DESC
         LIMIT 1`,
      )
      .bind(term)
      .first<PersonRecord>();

    return row ?? null;
  } catch (error) {
    logError("person_read_failed", error);

    return null;
  }
}

export async function readPersonTitleIds(db: D1Database, personId: number, limit = 48) {
  try {
    const rows = await db
      .prepare(
        `SELECT p.title_id AS titleId
           FROM catalog_person_titles AS p
           JOIN catalog_titles AS t ON t.id = p.title_id
          WHERE p.person_id = ?1
          ORDER BY COALESCE(t.year, 0) DESC, t.popularity DESC
          LIMIT ?2`,
      )
      .bind(personId, clamp(limit, 1, 96))
      .all<{ titleId: string }>();

    return rows.results.map((row) => row.titleId);
  } catch (error) {
    logError("person_titles_failed", error);

    return [];
  }
}

export async function readPersonShelf(db: D1Database, viewerId: string, personId: number) {
  try {
    const row = await db
      .prepare(
        `SELECT count(*) AS shelved,
                sum(CASE WHEN v.status = 'watched' THEN 1 ELSE 0 END) AS watched
           FROM viewing_entries AS v
           JOIN catalog_person_titles AS p ON p.title_id = v.title_id
          WHERE v.viewer_id = ?1 AND p.person_id = ?2`,
      )
      .bind(viewerId, personId)
      .first<{ shelved: number; watched: number | null }>();

    return { shelved: row?.shelved ?? 0, watched: row?.watched ?? 0 };
  } catch (error) {
    logError("person_shelf_failed", error);

    return { shelved: 0, watched: 0 };
  }
}
