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

const CREDIT_COLUMNS = `c.person_id AS "personId", p.name, p.profile_path AS "profilePath",
       c.department, c.job, c.character, c.billing,
       c.season_number AS "seasonNumber", c.episode_number AS "episodeNumber",
       c.episode_count AS "episodeCount"`;

function scopeClause(scope: CreditScope): {
  where: string;
  binds: DatabaseValue[];
} {
  if (scope.season === undefined || scope.season === null) {
    return { where: "c.season_number IS NULL", binds: [] };
  }

  if (scope.episode === undefined || scope.episode === null) {
    return { where: "c.season_number = $2", binds: [scope.season] };
  }

  return {
    where: "c.season_number = $2 AND c.episode_number = $3",
    binds: [scope.season, scope.episode],
  };
}

async function creditPage(
  db: Database,
  titleId: string,
  scope: CreditScope,
  acting: boolean,
  limit: number,
  offset: number,
) {
  const { where, binds } = scopeClause(scope);
  const limitParameter = binds.length + 2;
  const offsetParameter = limitParameter + 1;
  const rows = await db.query<CreditRow>(
    `SELECT ${CREDIT_COLUMNS}
       FROM catalog_credits AS c
       JOIN catalog_people AS p ON p.person_id = c.person_id
       WHERE c.title_id = $1
         AND c.department ${acting ? "=" : "<>"} 'Acting'
         AND ${where}
       ORDER BY ${acting ? "c.billing IS NULL, c.billing, p.name" : "c.episode_number, p.name"}
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    [titleId, ...binds, clamp(limit, 1, 120), Math.max(0, offset)],
  );

  return rows.rows;
}

async function creditTotals(db: Database, titleId: string, scope: CreditScope) {
  const { where, binds } = scopeClause(scope);
  const row = await db.first<{
    castTotal: number | null;
    crewTotal: number | null;
  }>(
    `SELECT
         sum(CASE WHEN c.department = 'Acting' THEN 1 ELSE 0 END) AS "castTotal",
         sum(CASE WHEN c.department <> 'Acting' THEN 1 ELSE 0 END) AS "crewTotal"
       FROM catalog_credits AS c
       WHERE c.title_id = $1 AND ${where}`,
    [titleId, ...binds],
  );

  return { castTotal: row?.castTotal ?? 0, crewTotal: row?.crewTotal ?? 0 };
}

export async function readTitleCredits(
  db: Database,
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

export async function readCreditSeasons(db: Database, titleId: string) {
  const rows = await db.query<{
    season: number;
    credits: number;
    episodes: number;
  }>(
    `SELECT season_number AS season, count(*) AS credits,
              count(DISTINCT episode_number) AS episodes
       FROM catalog_credits
       WHERE title_id = $1 AND season_number IS NOT NULL
       GROUP BY season_number
       ORDER BY season_number`,
    [titleId],
  );

  return rows.rows;
}

const TITLES_CHUNK = 5_000;

export async function rebuildPersonTitles(db: Database) {
  let after = 0;

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await db.query<{ personId: number }>(
      `SELECT person_id AS "personId"
         FROM catalog_people
        WHERE person_id > $1
        ORDER BY person_id
        LIMIT $2`,
      [after, TITLES_CHUNK],
    );
    const last = wave.rows.at(-1)?.personId;

    if (last === undefined) {
      break;
    }

    // oxlint-disable-next-line no-await-in-loop
    await db.execute(
      `UPDATE catalog_people AS p
          SET titles = counted.titles
         FROM (
           SELECT person_id, count(DISTINCT title_id) AS titles
             FROM catalog_credits
            WHERE person_id > $1 AND person_id <= $2
            GROUP BY person_id
         ) AS counted
        WHERE p.person_id = counted.person_id
          AND p.titles IS DISTINCT FROM counted.titles`,
      [after, last],
    );

    // oxlint-disable-next-line no-await-in-loop
    await db.execute(
      `UPDATE catalog_people AS p
          SET titles = 0
        WHERE p.person_id > $1 AND p.person_id <= $2 AND p.titles <> 0
          AND NOT EXISTS (
            SELECT 1 FROM catalog_credits AS c WHERE c.person_id = p.person_id
          )`,
      [after, last],
    );

    after = last;
  }

  const total = await db.first<{ credits: number }>(
    `SELECT count(*) AS credits FROM catalog_credits`,
  );

  return total?.credits ?? 0;
}

export async function readPerson(db: Database, identifier: string): Promise<PersonRecord | null> {
  const personId = Number(identifier);

  if (Number.isInteger(personId) && personId > 0) {
    try {
      const row = await db.first<PersonRecord>(
        `SELECT person_id AS "personId", name, titles FROM catalog_people WHERE person_id = $1`,
        [personId],
      );

      return row ?? null;
    } catch (error) {
      logError("person_read_failed", error);

      return null;
    }
  }

  const term = identifier.trim().toLowerCase();

  if (term.length < 2 || term.length > 120) {
    return null;
  }

  try {
    const row = await db.first<PersonRecord>(
      `SELECT person_id AS "personId", name, titles
         FROM catalog_people
         WHERE lower(name) = $1
         ORDER BY titles DESC
         LIMIT 1`,
      [term],
    );

    return row ?? null;
  } catch (error) {
    logError("person_read_failed", error);

    return null;
  }
}

export async function listPeople(
  db: Database,
  query: string,
  limit = 60,
  offset = 0,
): Promise<PersonRecord[]> {
  const term = query.trim().toLowerCase();
  const size = clamp(limit, 1, 120);
  const skip = Math.max(0, offset);

  try {
    const rows = term
      ? await db.query<PersonRecord>(
          `SELECT person_id AS "personId", name, titles
               FROM catalog_people
              WHERE titles > 0 AND lower(name) LIKE $1
              ORDER BY CASE WHEN lower(name) LIKE $2 THEN 0 ELSE 1 END, titles DESC, name
              LIMIT $3 OFFSET $4`,
          [`%${term}%`, `${term}%`, size, skip],
        )
      : await db.query<PersonRecord>(
          `SELECT person_id AS "personId", name, titles
               FROM catalog_people
              WHERE titles > 0
              ORDER BY titles DESC, name
              LIMIT $1 OFFSET $2`,
          [size, skip],
        );

    return rows.rows;
  } catch (error) {
    logError("people_list_failed", error);

    return [];
  }
}

export async function readPersonTitleIds(db: Database, personId: number, limit = 48, offset = 0) {
  try {
    const rows = await db.query<{ titleId: string }>(
      `SELECT p.title_id AS "titleId"
           FROM catalog_credits AS p
           JOIN catalog_titles AS t ON t.id = p.title_id
          WHERE p.person_id = $1
          GROUP BY p.title_id, t.year, t.popularity
          ORDER BY COALESCE(t.year, 0) DESC, t.popularity DESC
          LIMIT $2 OFFSET $3`,
      [personId, clamp(limit, 1, 96), Math.max(0, offset)],
    );

    return rows.rows.map((row) => row.titleId);
  } catch (error) {
    logError("person_titles_failed", error);

    return [];
  }
}

export async function unverifiedPeople(db: Database, limit: number) {
  const size = clamp(limit, 1, 2_000);

  try {
    const stored = await db.query<{ personId: number }>(
      `SELECT person_id AS "personId"
           FROM catalog_people
          WHERE verified_at IS NULL
          ORDER BY titles DESC
          LIMIT $1`,
      [size],
    );

    if (stored.rows.length > 0) {
      return stored.rows.map((row) => row.personId);
    }

    const missing = await db.query<{ personId: number }>(
      `SELECT DISTINCT c.person_id AS "personId"
           FROM catalog_credits AS c
          WHERE c.person_id > (
            SELECT COALESCE(max(person_id), 0) FROM catalog_people WHERE verified_at IS NOT NULL
          )
          ORDER BY c.person_id
          LIMIT $1`,
      [size],
    );

    return missing.rows.map((row) => row.personId);
  } catch (error) {
    logError("unverified_people_failed", error);

    return [];
  }
}

export async function markPeopleVerified(db: Database, personIds: number[]) {
  if (personIds.length === 0) {
    return;
  }

  const ordered = personIds.toSorted((left, right) => left - right);

  await db.execute(
    `UPDATE catalog_people SET verified_at = CURRENT_TIMESTAMP
       WHERE person_id IN (${ordered.map((_unused, index) => `$${index + 1}`).join(",")})`,
    ordered,
  );
}

export async function readPersonShelf(db: Database, viewerId: string, personId: number) {
  try {
    const row = await db.first<{ shelved: number; watched: number | null }>(
      `SELECT count(*) AS shelved,
                sum(CASE WHEN v.status = 'watched' THEN 1 ELSE 0 END) AS watched
           FROM viewing_entries AS v
           JOIN catalog_credits AS p ON p.title_id = v.title_id
          WHERE v.viewer_id = $1 AND p.person_id = $2`,
      [viewerId, personId],
    );

    return { shelved: row?.shelved ?? 0, watched: row?.watched ?? 0 };
  } catch (error) {
    logError("person_shelf_failed", error);

    return { shelved: 0, watched: 0 };
  }
}
