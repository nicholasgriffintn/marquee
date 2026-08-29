import {
  NO_AWARDS,
  type AwardEntry,
  type AwardSummary,
} from "../../src/domain/awards.ts";
import type { AwardStatement } from "../clients/wikidata-awards.ts";
import { logError } from "../lib/logging.ts";

const ENTRY_LIMIT = 60;

export type TitleAwardWrite = { titleId: string; entries: AwardStatement[] };

export type PersonAwardWrite = { personId: number; entries: AwardStatement[] };

type AwardRow = {
  awardId: string;
  label: string;
  ceremonyYear: number;
  outcome: string;
};

const ENTRY_COLUMNS = `link.award_id AS "awardId", a.label,
       link.ceremony_year AS "ceremonyYear", link.outcome`;

const ENTRY_GROUP = `link.award_id, a.label, link.ceremony_year, link.outcome`;

const ENTRY_ORDER = `CASE WHEN link.outcome = 'won' THEN 0 ELSE 1 END,
         link.ceremony_year DESC, a.label`;

function toSummary(
  rows: AwardRow[],
  summary: string | null = null,
): AwardSummary {
  const entries = rows.map((row): AwardEntry => ({
    awardId: row.awardId,
    label: row.label,
    ceremonyYear: row.ceremonyYear || null,
    outcome: row.outcome === "won" ? "won" : "nominated",
  }));

  const wins = entries.filter((entry) => entry.outcome === "won").length;

  return { wins, nominations: entries.length - wins, entries, summary };
}

export async function titleAwardCandidates(
  db: Database,
  source: string,
  limit: number,
  staleDays: number,
) {
  const stale = `-${staleDays} days`;
  const shared = `t.wikidata_id IS NOT NULL
       AND (s.title_id IS NULL OR s.synced_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)))`;
  const join = `LEFT JOIN title_award_sync AS s ON s.title_id = t.id AND s.source = $3`;
  const working = await db.query<{ titleId: string; entityId: string }>(
    `SELECT t.id AS "titleId", t.wikidata_id AS "entityId"
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       ${join}
       WHERE ${shared}
       ORDER BY w.demand DESC
       LIMIT $2`,
    [stale, limit, source],
  );

  if (working.rows.length >= limit) {
    return working.rows;
  }

  const popular = await db.query<{ titleId: string; entityId: string }>(
    `SELECT t.id AS "titleId", t.wikidata_id AS "entityId"
       FROM catalog_titles AS t
       ${join}
       WHERE ${shared}
       ORDER BY t.popularity DESC
       LIMIT $2`,
    [stale, limit, source],
  );

  const merged = new Map(working.rows.map((row) => [row.titleId, row]));

  for (const row of popular.rows) {
    if (merged.size >= limit) {
      break;
    }

    merged.set(row.titleId, row);
  }

  return [...merged.values()];
}

export async function personAwardCandidates(
  db: Database,
  source: string,
  limit: number,
  staleDays: number,
) {
  const rows = await db.query<{ personId: number; gender: number | null }>(
    `SELECT p.person_id AS "personId", p.gender AS "gender"
       FROM catalog_people AS p
       LEFT JOIN person_award_sync AS s ON s.person_id = p.person_id AND s.source = $3
       WHERE p.titles > 0
         AND (s.person_id IS NULL OR s.synced_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)))
       ORDER BY p.popularity DESC
       LIMIT $2`,
    [`-${staleDays} days`, limit, source],
  );

  return rows.rows;
}

function awardKey(entry: {
  awardId: string;
  ceremonyYear: number | null;
  outcome: string;
}) {
  return `${entry.awardId}|${entry.ceremonyYear ?? 0}|${entry.outcome}`;
}

function sameAwardSet(existing: Set<string>, entries: AwardStatement[]) {
  const incoming = new Set(
    entries.map((entry) =>
      awardKey({ ...entry, ceremonyYear: entry.ceremonyYear ?? null }),
    ),
  );

  return (
    existing.size === incoming.size &&
    [...existing].every((key) => incoming.has(key))
  );
}

async function currentAwardKeys<Id extends string | number>(
  db: Database,
  table: "title_awards" | "person_awards",
  column: "title_id" | "person_id",
  ids: Id[],
  source: string,
) {
  const keys = new Map<Id, Set<string>>();

  if (ids.length === 0) {
    return keys;
  }

  const rows = await db.query<{
    id: Id;
    awardId: string;
    ceremonyYear: number;
    outcome: string;
  }>(
    `SELECT ${column} AS id, award_id AS "awardId", ceremony_year AS "ceremonyYear", outcome
       FROM ${table}
       WHERE source = $1 AND ${column} IN (${ids.map((_, index) => `$${index + 2}`).join(",")})`,
    [source, ...ids],
  );

  for (const row of rows.rows) {
    const set = keys.get(row.id) ?? new Set<string>();

    set.add(awardKey(row));
    keys.set(row.id, set);
  }

  return keys;
}

async function upsertAwards(
  transaction: DatabaseTransaction,
  entries: AwardStatement[],
) {
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop
    await transaction.execute(
      `INSERT INTO awards (award_id, label, wikidata_id, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT(award_id) DO UPDATE SET
           label = excluded.label,
           wikidata_id = COALESCE(excluded.wikidata_id, awards.wikidata_id),
           updated_at = CURRENT_TIMESTAMP`,
      [entry.awardId, entry.label, entry.wikidataId],
    );
  }
}

export async function storeTitleAwards(
  db: Database,
  source: string,
  writes: TitleAwardWrite[],
) {
  const current = await currentAwardKeys(
    db,
    "title_awards",
    "title_id",
    writes.map((write) => write.titleId),
    source,
  );

  for (const write of writes) {
    const unchanged = sameAwardSet(
      current.get(write.titleId) ?? new Set(),
      write.entries,
    );

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      if (!unchanged) {
        await transaction.execute(
          `DELETE FROM title_awards WHERE title_id = $1 AND source = $2`,
          [write.titleId, source],
        );
        await upsertAwards(transaction, write.entries);

        for (const entry of write.entries) {
          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(
            `INSERT INTO title_awards
                 (title_id, award_id, ceremony_year, outcome, source)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
            [
              write.titleId,
              entry.awardId,
              entry.ceremonyYear ?? 0,
              entry.outcome,
              source,
            ],
          );
        }
      }

      await transaction.execute(
        `INSERT INTO title_award_sync (title_id, source, statements, synced_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id, source) DO UPDATE SET
             statements = excluded.statements,
             synced_at = CURRENT_TIMESTAMP`,
        [write.titleId, source, write.entries.length],
      );
    });
  }
}

export async function storePersonAwards(
  db: Database,
  source: string,
  writes: PersonAwardWrite[],
) {
  const current = await currentAwardKeys(
    db,
    "person_awards",
    "person_id",
    writes.map((write) => write.personId),
    source,
  );

  for (const write of writes) {
    const unchanged = sameAwardSet(
      current.get(write.personId) ?? new Set(),
      write.entries,
    );

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      if (!unchanged) {
        await transaction.execute(
          `DELETE FROM person_awards WHERE person_id = $1 AND source = $2`,
          [write.personId, source],
        );
        await upsertAwards(transaction, write.entries);

        for (const entry of write.entries) {
          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(
            `INSERT INTO person_awards
                 (person_id, award_id, ceremony_year, outcome, source)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
            [
              write.personId,
              entry.awardId,
              entry.ceremonyYear ?? 0,
              entry.outcome,
              source,
            ],
          );
        }
      }

      await transaction.execute(
        `INSERT INTO person_award_sync (person_id, source, statements, synced_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(person_id, source) DO UPDATE SET
             statements = excluded.statements,
             synced_at = CURRENT_TIMESTAMP`,
        [write.personId, source, write.entries.length],
      );
    });
  }
}

export async function readTitleAwards(
  db: Database,
  titleId: string,
): Promise<AwardSummary> {
  try {
    const [entries, tally] = await Promise.all([
      db.query<AwardRow>(
        `SELECT ${ENTRY_COLUMNS}
         FROM title_awards AS link
         JOIN awards AS a ON a.award_id = link.award_id
         WHERE link.title_id = $1
         GROUP BY ${ENTRY_GROUP}
         ORDER BY ${ENTRY_ORDER}
         LIMIT $2`,
        [titleId, ENTRY_LIMIT],
      ),
      db.query<{ summary: string | null }>(
        `SELECT awards AS summary FROM catalog_title_ratings WHERE title_id = $1`,
        [titleId],
      ),
    ]);

    return toSummary(entries.rows, tally.rows[0]?.summary ?? null);
  } catch (error) {
    logError("title_awards_read_failed", error, { titleId });

    return NO_AWARDS;
  }
}

export async function readPersonAwards(
  db: Database,
  personId: number,
): Promise<AwardSummary> {
  try {
    const rows = await db.query<AwardRow>(
      `SELECT ${ENTRY_COLUMNS}
         FROM person_awards AS link
         JOIN awards AS a ON a.award_id = link.award_id
         WHERE link.person_id = $1
         GROUP BY ${ENTRY_GROUP}
         ORDER BY ${ENTRY_ORDER}
         LIMIT $2`,
      [personId, ENTRY_LIMIT],
    );

    return toSummary(rows.rows);
  } catch (error) {
    logError("person_awards_read_failed", error, { personId });

    return NO_AWARDS;
  }
}
