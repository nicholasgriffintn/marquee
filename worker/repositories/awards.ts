import {
  NO_AWARDS,
  type AwardEntry,
  type AwardRun,
  type AwardSummary,
} from "../../src/domain/awards.ts";
import type { AwardStatement } from "../clients/wikidata-awards.ts";
import { logError } from "../lib/logging.ts";

const WRITE_CHUNK = 60;
const ENTRY_LIMIT = 60;
const RUN_LIMIT = 12;

export type TitleAwardWrite = { titleId: string; entityId: string; entries: AwardStatement[] };

export type PersonAwardWrite = { personId: number; entries: AwardStatement[] };

type AwardRow = { awardId: string; label: string; ceremonyYear: number; outcome: string };

const ENTRY_COLUMNS = `link.award_id AS awardId, a.label,
       link.ceremony_year AS ceremonyYear, link.outcome`;

const ENTRY_ORDER = `CASE WHEN link.outcome = 'won' THEN 0 ELSE 1 END,
         link.ceremony_year DESC, a.label`;

function toSummary(rows: AwardRow[]): AwardSummary {
  const entries = rows.map((row): AwardEntry => ({
    awardId: row.awardId,
    label: row.label,
    ceremonyYear: row.ceremonyYear || null,
    outcome: row.outcome === "won" ? "won" : "nominated",
  }));

  const wins = entries.filter((entry) => entry.outcome === "won").length;

  return { wins, nominations: entries.length - wins, entries };
}

export async function titleAwardCandidates(db: D1Database, limit: number, staleDays: number) {
  const stale = `-${staleDays} days`;
  const shared = `t.wikidata_id IS NOT NULL
       AND (s.title_id IS NULL OR s.synced_at < datetime('now', ?1))`;
  const working = await db
    .prepare(
      `SELECT t.id AS titleId, t.wikidata_id AS entityId
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN title_award_sync AS s ON s.title_id = t.id
       WHERE ${shared}
       ORDER BY w.demand DESC
       LIMIT ?2`,
    )
    .bind(stale, limit)
    .all<{ titleId: string; entityId: string }>();

  if (working.results.length >= limit) {
    return working.results;
  }

  const popular = await db
    .prepare(
      `SELECT t.id AS titleId, t.wikidata_id AS entityId
       FROM catalog_titles AS t
       LEFT JOIN title_award_sync AS s ON s.title_id = t.id
       WHERE ${shared}
       ORDER BY t.popularity DESC
       LIMIT ?2`,
    )
    .bind(stale, limit)
    .all<{ titleId: string; entityId: string }>();

  const merged = new Map(working.results.map((row) => [row.titleId, row]));

  for (const row of popular.results) {
    if (merged.size >= limit) {
      break;
    }

    merged.set(row.titleId, row);
  }

  return [...merged.values()];
}

export async function personAwardCandidates(db: D1Database, limit: number, staleDays: number) {
  const rows = await db
    .prepare(
      `SELECT p.person_id AS personId
       FROM catalog_people AS p
       LEFT JOIN person_award_sync AS s ON s.person_id = p.person_id
       WHERE p.titles > 0
         AND (s.person_id IS NULL OR s.synced_at < datetime('now', ?1))
       ORDER BY p.popularity DESC
       LIMIT ?2`,
    )
    .bind(`-${staleDays} days`, limit)
    .all<{ personId: number }>();

  return rows.results.map((row) => row.personId);
}

function awardUpserts(db: D1Database, entries: AwardStatement[]) {
  return entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO awards (award_id, label, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(award_id) DO UPDATE SET
           label = excluded.label,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(entry.awardId, entry.label),
  );
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += WRITE_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(statements.slice(index, index + WRITE_CHUNK));
  }
}

export async function storeTitleAwards(db: D1Database, writes: TitleAwardWrite[]) {
  const statements: D1PreparedStatement[] = [];

  for (const write of writes) {
    statements.push(
      db.prepare(`DELETE FROM title_awards WHERE title_id = ?`).bind(write.titleId),
      ...awardUpserts(db, write.entries),
      ...write.entries.map((entry) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO title_awards (title_id, award_id, ceremony_year, outcome)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(write.titleId, entry.awardId, entry.ceremonyYear ?? 0, entry.outcome),
      ),
      db
        .prepare(
          `INSERT INTO title_award_sync (title_id, entity_id, statements, synced_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id) DO UPDATE SET
             entity_id = excluded.entity_id,
             statements = excluded.statements,
             synced_at = CURRENT_TIMESTAMP`,
        )
        .bind(write.titleId, write.entityId, write.entries.length),
    );
  }

  await runBatches(db, statements);
}

export async function storePersonAwards(db: D1Database, writes: PersonAwardWrite[]) {
  const statements: D1PreparedStatement[] = [];

  for (const write of writes) {
    statements.push(
      db.prepare(`DELETE FROM person_awards WHERE person_id = ?`).bind(write.personId),
      ...awardUpserts(db, write.entries),
      ...write.entries.map((entry) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO person_awards (person_id, award_id, ceremony_year, outcome)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(write.personId, entry.awardId, entry.ceremonyYear ?? 0, entry.outcome),
      ),
      db
        .prepare(
          `INSERT INTO person_award_sync (person_id, statements, synced_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(person_id) DO UPDATE SET
             statements = excluded.statements,
             synced_at = CURRENT_TIMESTAMP`,
        )
        .bind(write.personId, write.entries.length),
    );
  }

  await runBatches(db, statements);
}

export async function readTitleAwards(db: D1Database, titleId: string): Promise<AwardSummary> {
  try {
    const rows = await db
      .prepare(
        `SELECT ${ENTRY_COLUMNS}
         FROM title_awards AS link
         JOIN awards AS a ON a.award_id = link.award_id
         WHERE link.title_id = ?1
         ORDER BY ${ENTRY_ORDER}
         LIMIT ?2`,
      )
      .bind(titleId, ENTRY_LIMIT)
      .all<AwardRow>();

    return toSummary(rows.results);
  } catch (error) {
    logError("title_awards_read_failed", error, { titleId });

    return NO_AWARDS;
  }
}

export async function readPersonAwards(db: D1Database, personId: number): Promise<AwardSummary> {
  try {
    const rows = await db
      .prepare(
        `SELECT ${ENTRY_COLUMNS}
         FROM person_awards AS link
         JOIN awards AS a ON a.award_id = link.award_id
         WHERE link.person_id = ?1
         ORDER BY ${ENTRY_ORDER}
         LIMIT ?2`,
      )
      .bind(personId, ENTRY_LIMIT)
      .all<AwardRow>();

    return toSummary(rows.results);
  } catch (error) {
    logError("person_awards_read_failed", error, { personId });

    return NO_AWARDS;
  }
}

export async function readAwardRuns(
  db: D1Database,
  viewerId: string,
  awardIds: string[],
): Promise<AwardRun[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT link.award_id AS awardId, a.label,
                count(DISTINCT link.title_id) AS total,
                count(DISTINCT CASE WHEN v.title_id IS NOT NULL THEN link.title_id END) AS held,
                count(DISTINCT CASE WHEN v.status = 'watched' THEN link.title_id END) AS watched
         FROM title_awards AS link
         JOIN awards AS a ON a.award_id = link.award_id
         LEFT JOIN viewing_entries AS v
           ON v.title_id = link.title_id AND v.viewer_id = ?1
         WHERE link.outcome = 'won'
           AND link.award_id IN (SELECT value FROM json_each(?2))
         GROUP BY link.award_id, a.label
         ORDER BY total DESC`,
      )
      .bind(viewerId, JSON.stringify(awardIds.slice(0, RUN_LIMIT)))
      .all<AwardRun>();

    return rows.results;
  } catch (error) {
    logError("award_runs_read_failed", error, { viewerId });

    return [];
  }
}
