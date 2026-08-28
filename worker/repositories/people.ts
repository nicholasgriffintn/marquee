import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";

export type PersonRecord = { personId: number; name: string; titles: number };

export type CreditRow = {
  personId: number;
  name: string;
  profilePath: string | null;
  department: string;
  job: string | null;
  character: string | null;
  billing: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeCount: number | null;
};

export type CreditScope = { season?: number | null; episode?: number | null };

const CREDIT_COLUMNS = `c.person_id AS personId, p.name, p.profile_path AS profilePath,
       c.department, c.job, c.character, c.billing,
       c.season_number AS seasonNumber, c.episode_number AS episodeNumber,
       c.episode_count AS episodeCount`;

function scopeClause(scope: CreditScope): { where: string; binds: unknown[] } {
  if (scope.season === undefined || scope.season === null) {
    return { where: "c.season_number IS NULL", binds: [] };
  }

  if (scope.episode === undefined || scope.episode === null) {
    return { where: "c.season_number = ?", binds: [scope.season] };
  }

  return {
    where: "c.season_number = ? AND c.episode_number = ?",
    binds: [scope.season, scope.episode],
  };
}

async function creditPage(
  db: D1Database,
  titleId: string,
  scope: CreditScope,
  acting: boolean,
  limit: number,
  offset: number,
) {
  const { where, binds } = scopeClause(scope);
  const rows = await db
    .prepare(
      `SELECT ${CREDIT_COLUMNS}
       FROM catalog_credits AS c
       JOIN catalog_people AS p ON p.person_id = c.person_id
       WHERE c.title_id = ?
         AND c.department ${acting ? "=" : "<>"} 'Acting'
         AND ${where}
       ORDER BY ${acting ? "c.billing IS NULL, c.billing, p.name" : "c.episode_number, p.name"}
       LIMIT ? OFFSET ?`,
    )
    .bind(titleId, ...binds, clamp(limit, 1, 120), Math.max(0, offset))
    .all<CreditRow>();

  return rows.results;
}

async function creditTotals(db: D1Database, titleId: string, scope: CreditScope) {
  const { where, binds } = scopeClause(scope);
  const row = await db
    .prepare(
      `SELECT
         sum(CASE WHEN c.department = 'Acting' THEN 1 ELSE 0 END) AS castTotal,
         sum(CASE WHEN c.department <> 'Acting' THEN 1 ELSE 0 END) AS crewTotal
       FROM catalog_credits AS c
       WHERE c.title_id = ? AND ${where}`,
    )
    .bind(titleId, ...binds)
    .first<{ castTotal: number | null; crewTotal: number | null }>();

  return { castTotal: row?.castTotal ?? 0, crewTotal: row?.crewTotal ?? 0 };
}

export async function readTitleCredits(
  db: D1Database,
  titleId: string,
  scope: CreditScope = {},
  limit = 40,
  offset = 0,
) {
  const [cast, crew, { castTotal, crewTotal }] = await Promise.all([
    creditPage(db, titleId, scope, true, limit, offset),
    creditPage(db, titleId, scope, false, limit, offset),
    creditTotals(db, titleId, scope),
  ]);

  return {
    cast,
    crew,
    total: castTotal + crewTotal,
    limit,
    offset,
    hasMore: offset + limit < Math.max(castTotal, crewTotal),
  };
}

export async function readCreditSeasons(db: D1Database, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT season_number AS season, count(*) AS credits,
              count(DISTINCT episode_number) AS episodes
       FROM catalog_credits
       WHERE title_id = ? AND season_number IS NOT NULL
       GROUP BY season_number
       ORDER BY season_number`,
    )
    .bind(titleId)
    .all<{ season: number; credits: number; episodes: number }>();

  return rows.results;
}

export async function rebuildPersonTitles(db: D1Database) {
  await db
    .prepare(
      `UPDATE catalog_people
       SET titles = (
         SELECT count(DISTINCT title_id)
         FROM catalog_credits
         WHERE catalog_credits.person_id = catalog_people.person_id
       )`,
    )
    .run();

  const total = await db
    .prepare(`SELECT count(*) AS credits FROM catalog_credits`)
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

export async function listPeople(
  db: D1Database,
  query: string,
  limit = 60,
  offset = 0,
): Promise<PersonRecord[]> {
  const term = query.trim().toLowerCase();
  const size = clamp(limit, 1, 120);
  const skip = Math.max(0, offset);

  try {
    const rows = term
      ? await db
          .prepare(
            `SELECT person_id AS personId, name, titles
               FROM catalog_people
              WHERE titles > 0 AND lower(name) LIKE ?1
              ORDER BY CASE WHEN lower(name) LIKE ?2 THEN 0 ELSE 1 END, titles DESC, name
              LIMIT ?3 OFFSET ?4`,
          )
          .bind(`%${term}%`, `${term}%`, size, skip)
          .all<PersonRecord>()
      : await db
          .prepare(
            `SELECT person_id AS personId, name, titles
               FROM catalog_people
              WHERE titles > 0
              ORDER BY titles DESC, name
              LIMIT ?1 OFFSET ?2`,
          )
          .bind(size, skip)
          .all<PersonRecord>();

    return rows.results;
  } catch (error) {
    logError("people_list_failed", error);

    return [];
  }
}

export async function readPersonTitleIds(db: D1Database, personId: number, limit = 48, offset = 0) {
  try {
    const rows = await db
      .prepare(
        `SELECT p.title_id AS titleId
           FROM catalog_credits AS p
           JOIN catalog_titles AS t ON t.id = p.title_id
          WHERE p.person_id = ?1
          GROUP BY p.title_id
          ORDER BY COALESCE(t.year, 0) DESC, t.popularity DESC
          LIMIT ?2 OFFSET ?3`,
      )
      .bind(personId, clamp(limit, 1, 96), Math.max(0, offset))
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
           JOIN catalog_credits AS p ON p.title_id = v.title_id
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
