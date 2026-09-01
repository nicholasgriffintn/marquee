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
  db: Database,
  viewerId: string,
  revision: string,
): Promise<RailRecord> {
  const row = await db.first<RailRow>(
    `SELECT payload, revision, generation_id AS "generationId",
              attempted_revision AS "attemptedRevision",
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 3600.0 AS "ageHours",
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - attempted_at)) / 3600.0 AS "attemptAgeHours"
         FROM ai_rails WHERE viewer_id = $1`,
    [viewerId],
  );

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

export async function readRecentRails(db: Database, viewerId: string) {
  const row = await db.first<Pick<RailRow, "payload">>(
    `SELECT payload FROM ai_rails
       WHERE viewer_id = $1
         AND created_at > (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))`,
    [viewerId, `-${MAX_AGE_HOURS} hours`],
  );

  return row ? toStoredRails(parseJson(row.payload)) : [];
}

async function claimGeneration(db: Database, viewerId: string, revision: string) {
  const result = await db.execute(
    `INSERT INTO ai_rails (viewer_id, claim_revision, claimed_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(viewer_id) DO UPDATE SET
         claim_revision = excluded.claim_revision,
         claimed_at = excluded.claimed_at
       WHERE ai_rails.claimed_at IS NULL
          OR ai_rails.claim_revision IS DISTINCT FROM excluded.claim_revision
          OR ai_rails.claimed_at < (CURRENT_TIMESTAMP + CAST($3 AS INTERVAL))`,
    [viewerId, revision, `-${LEASE_MINUTES} minutes`],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function releaseGeneration(db: Database, viewerId: string, revision: string) {
  await db.execute(
    `UPDATE ai_rails SET claim_revision = NULL, claimed_at = NULL
        WHERE viewer_id = $1 AND claim_revision = $2`,
    [viewerId, revision],
  );
}

async function markAttempt(db: Database, viewerId: string, revision: string) {
  const result = await db.execute(
    `UPDATE ai_rails
          SET attempted_revision = $2, attempted_at = CURRENT_TIMESTAMP,
              claim_revision = NULL, claimed_at = NULL
        WHERE viewer_id = $1 AND claim_revision = $2`,
    [viewerId, revision],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function persistRails(
  db: Database,
  viewerId: string,
  revision: string,
  generationId: string,
  rails: StoredRail[],
) {
  if (rails.length === 0) {
    const persisted = await markAttempt(db, viewerId, revision);

    logEvent(persisted ? "ai_rails_barren" : "ai_rails_superseded", {
      generationId,
      revision,
    });

    return persisted;
  }

  const result = await db.execute(
    `INSERT INTO ai_rails (viewer_id, revision, generation_id, payload, created_at,
                             attempted_revision, attempted_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(viewer_id) DO UPDATE SET
         revision = excluded.revision,
         generation_id = excluded.generation_id,
         payload = excluded.payload,
         created_at = CURRENT_TIMESTAMP,
         attempted_revision = excluded.attempted_revision,
         attempted_at = excluded.attempted_at,
         claim_revision = NULL,
         claimed_at = NULL
       WHERE ai_rails.claim_revision = excluded.revision`,
    [viewerId, revision, generationId, JSON.stringify(rails)],
  );
  const persisted = (result.rowCount ?? 0) > 0;

  logEvent(persisted ? "ai_rails_generated" : "ai_rails_superseded", {
    rails: rails.length,
    generationId,
    revision,
  });

  return persisted;
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
