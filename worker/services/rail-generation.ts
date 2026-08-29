import { sha256Hex } from "../lib/hash.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { parseJson } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { toStoredRails, type StoredRail } from "./rail-identity.ts";

const LEASE_MINUTES = 10;
const MAX_AGE_HOURS = 12;

type RailRow = {
  payload: string;
  revision: string;
  generationId: string;
  attemptedRevision: string | null;
  ageHours: number;
  attemptAgeHours: number | null;
};

export type RailRecord = {
  rails: StoredRail[];
  revision: string;
  generationId: string;
  isSettled: boolean;
};

const NO_RECORD: RailRecord = {
  rails: [],
  revision: "",
  generationId: "",
  isSettled: false,
};

export async function readRailRecord(
  db: D1Database,
  viewerId: string,
  revision: string,
): Promise<RailRecord> {
  const row = await db
    .prepare(
      `SELECT payload, revision, generation_id AS generationId,
              attempted_revision AS attemptedRevision,
              (julianday('now') - julianday(created_at)) * 24 AS ageHours,
              (julianday('now') - julianday(attempted_at)) * 24 AS attemptAgeHours
         FROM ai_rails WHERE viewer_id = ?`,
    )
    .bind(viewerId)
    .first<RailRow>();

  if (!row) {
    return NO_RECORD;
  }

  const built = row.revision === revision && row.ageHours < MAX_AGE_HOURS;
  const attempted =
    row.attemptedRevision === revision &&
    row.attemptAgeHours !== null &&
    row.attemptAgeHours < MAX_AGE_HOURS;

  return {
    rails: toStoredRails(parseJson(row.payload)),
    revision: row.revision,
    generationId: row.generationId,
    isSettled: Boolean(revision) && (built || attempted),
  };
}

async function claimGeneration(db: D1Database, viewerId: string, revision: string) {
  const result = await db
    .prepare(
      `INSERT INTO ai_rails (viewer_id, claim_revision, claimed_at)
       VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(viewer_id) DO UPDATE SET
         claim_revision = excluded.claim_revision,
         claimed_at = excluded.claimed_at
       WHERE ai_rails.claimed_at IS NULL
          OR ai_rails.claim_revision IS NOT excluded.claim_revision
          OR ai_rails.claimed_at < datetime('now', ?3)`,
    )
    .bind(viewerId, revision, `-${LEASE_MINUTES} minutes`)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function releaseGeneration(db: D1Database, viewerId: string, revision: string) {
  await db
    .prepare(
      `UPDATE ai_rails SET claim_revision = NULL, claimed_at = NULL
        WHERE viewer_id = ?1 AND claim_revision = ?2`,
    )
    .bind(viewerId, revision)
    .run();
}

async function markAttempt(db: D1Database, viewerId: string, revision: string) {
  await db
    .prepare(
      `UPDATE ai_rails
          SET attempted_revision = ?2, attempted_at = datetime('now'),
              claim_revision = NULL, claimed_at = NULL
        WHERE viewer_id = ?1`,
    )
    .bind(viewerId, revision)
    .run();
}

export async function persistRails(
  db: D1Database,
  viewerId: string,
  revision: string,
  generationId: string,
  rails: StoredRail[],
) {
  if (rails.length === 0) {
    await markAttempt(db, viewerId, revision);
    logEvent("ai_rails_barren", { generationId, revision });

    return;
  }

  await db
    .prepare(
      `INSERT INTO ai_rails (viewer_id, revision, generation_id, payload, created_at,
                             attempted_revision, attempted_at)
       VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, ?2, datetime('now'))
       ON CONFLICT(viewer_id) DO UPDATE SET
         revision = excluded.revision,
         generation_id = excluded.generation_id,
         payload = excluded.payload,
         created_at = CURRENT_TIMESTAMP,
         attempted_revision = excluded.attempted_revision,
         attempted_at = excluded.attempted_at,
         claim_revision = NULL,
         claimed_at = NULL`,
    )
    .bind(viewerId, revision, generationId, JSON.stringify(rails))
    .run();

  logEvent("ai_rails_generated", { rails: rails.length, generationId });
}

export async function startGeneration(env: Bindings, viewerId: string, revision: string) {
  if (!revision || !(await claimGeneration(env.DB, viewerId, revision))) {
    return { started: false };
  }

  const generationId = `rails-${await sha256Hex(`${viewerId}|${revision}`, 8)}-${crypto
    .randomUUID()
    .slice(0, 8)}`;

  try {
    await env.RAILS_WORKFLOW.create({
      id: generationId,
      params: { viewerId, revision, generationId },
    });
    logEvent("rails_generation_started", { generationId, revision });

    return { started: true, generationId };
  } catch (error) {
    logError("rails_generation_start_failed", error, { generationId });
    await releaseGeneration(env.DB, viewerId, revision);

    return { started: false };
  }
}
