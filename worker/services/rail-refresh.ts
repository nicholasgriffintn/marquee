import type { DatabaseTransaction } from "../database/types.ts";
import { logError, logEvent } from "../lib/logging.ts";
import type { Bindings, RailRefreshJob } from "../types.ts";
import { readRailRecord, startGeneration } from "./rail-generation.ts";
import { readRailRevision } from "./rail-revision.ts";

const QUIET_WINDOW_SECONDS = 900;
const QUIET_WINDOW = `${QUIET_WINDOW_SECONDS} seconds`;
const MINIMUM_INTERVAL = "12 hours";
const MAXIMUM_DIRTY_AGE = "24 hours";
const CLAIM_RETRY_SECONDS = 60;
const MAX_QUEUE_DELAY_SECONDS = 86_400;

type RefreshSchedule = {
  dirtyRevision: string;
  dueAt: Date | string;
};

type RefreshAction = { action: "complete" } | { action: "defer"; delaySeconds: number };

function queueDelay(dueAt: Date | string) {
  const milliseconds = new Date(dueAt).getTime() - Date.now();

  return Math.min(MAX_QUEUE_DELAY_SECONDS, Math.max(0, Math.ceil(milliseconds / 1_000)));
}

async function markDirty(
  db: DatabaseTransaction,
  viewerId: string,
  revision: string,
  token?: string,
) {
  await db.execute(`INSERT INTO ai_rails (viewer_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
    viewerId,
  ]);

  await db.execute(
    `UPDATE ai_rails
        SET dirty_revision = $2,
            dirty_since = COALESCE(dirty_since, CURRENT_TIMESTAMP),
            dirty_at = CURRENT_TIMESTAMP,
            refresh_due_at = CASE
              WHEN revision = '' AND attempted_revision IS NULL THEN CURRENT_TIMESTAMP
              WHEN EXISTS (
                SELECT 1 FROM viewer_ai_models
                 WHERE viewer_id = $1 AND updated_at > ai_rails.created_at
              ) THEN CURRENT_TIMESTAMP
              ELSE LEAST(
                COALESCE(dirty_since, CURRENT_TIMESTAMP) + CAST($3 AS INTERVAL),
                GREATEST(
                  CURRENT_TIMESTAMP + CAST($4 AS INTERVAL),
                  COALESCE(claimed_at, created_at) + CAST($5 AS INTERVAL)
                )
              )
            END
      WHERE viewer_id = $1
        AND revision IS DISTINCT FROM $2
        AND attempted_revision IS DISTINCT FROM $2
        AND dirty_revision IS DISTINCT FROM $2
        AND ($6::text IS NULL OR refresh_token = $6)`,
    [viewerId, revision, MAXIMUM_DIRTY_AGE, QUIET_WINDOW, MINIMUM_INTERVAL, token ?? null],
  );
}

async function reserveSchedule(db: DatabaseTransaction, viewerId: string, revision: string) {
  const token = crypto.randomUUID();
  const row = await db.first<RefreshSchedule>(
    `UPDATE ai_rails
        SET refresh_token = $3
      WHERE viewer_id = $1
        AND dirty_revision = $2
        AND refresh_due_at IS NOT NULL
        AND refresh_token IS NULL
      RETURNING dirty_revision AS "dirtyRevision", refresh_due_at AS "dueAt"`,
    [viewerId, revision, token],
  );

  return row ? { ...row, token } : null;
}

async function clearToken(db: DatabaseTransaction, viewerId: string, token: string) {
  await db.execute(
    `UPDATE ai_rails SET refresh_token = NULL
      WHERE viewer_id = $1 AND refresh_token = $2`,
    [viewerId, token],
  );
}

async function clearSchedule(
  db: DatabaseTransaction,
  viewerId: string,
  token: string,
  revision: string,
) {
  const result = await db.execute(
    `UPDATE ai_rails
        SET dirty_revision = NULL, dirty_since = NULL, dirty_at = NULL,
            refresh_due_at = NULL, refresh_token = NULL
      WHERE viewer_id = $1 AND refresh_token = $2 AND dirty_revision = $3`,
    [viewerId, token, revision],
  );

  return result.rowCount > 0;
}

async function readSchedule(db: DatabaseTransaction, viewerId: string, token: string) {
  return db.first<RefreshSchedule>(
    `SELECT dirty_revision AS "dirtyRevision", refresh_due_at AS "dueAt"
       FROM ai_rails
      WHERE viewer_id = $1 AND refresh_token = $2 AND refresh_due_at IS NOT NULL`,
    [viewerId, token],
  );
}

export async function ensureRailRefreshScheduled(
  env: Bindings,
  viewerId: string,
  revision: string,
) {
  const reservation = await env.DB.transaction(async (transaction) => {
    await markDirty(transaction, viewerId, revision);

    return reserveSchedule(transaction, viewerId, revision);
  });

  if (!reservation) {
    return { scheduled: false };
  }

  const job: RailRefreshJob = {
    type: "refresh-rails",
    viewerId,
    token: reservation.token,
  };

  try {
    await env.RAIL_REFRESH_QUEUE.send(job, { delaySeconds: queueDelay(reservation.dueAt) });
    logEvent("rail_refresh_scheduled", {
      revision,
      delaySeconds: queueDelay(reservation.dueAt),
    });

    return { scheduled: true };
  } catch (error) {
    await clearToken(env.DB, viewerId, reservation.token);
    logError("rail_refresh_schedule_failed", error);

    return { scheduled: false };
  }
}

export async function runScheduledRailRefresh(
  env: Bindings,
  job: RailRefreshJob,
): Promise<RefreshAction> {
  let schedule = await readSchedule(env.DB, job.viewerId, job.token);

  if (!schedule) {
    return { action: "complete" };
  }

  const revision = await readRailRevision(env.DB, job.viewerId);

  if (!revision) {
    throw new Error("Rail revision is unavailable");
  }

  if (schedule.dirtyRevision !== revision) {
    await markDirty(env.DB, job.viewerId, revision, job.token);
    schedule = await readSchedule(env.DB, job.viewerId, job.token);
  }

  if (!schedule) {
    return { action: "complete" };
  }

  const delaySeconds = queueDelay(schedule.dueAt);

  if (delaySeconds > 0) {
    return { action: "defer", delaySeconds };
  }

  const record = await readRailRecord(env.DB, job.viewerId, revision);

  if (record.isSettled) {
    await clearSchedule(env.DB, job.viewerId, job.token, revision);

    return { action: "complete" };
  }

  const generation = await startGeneration(env, job.viewerId, revision);

  if (!generation.started) {
    return { action: "defer", delaySeconds: CLAIM_RETRY_SECONDS };
  }

  return (await clearSchedule(env.DB, job.viewerId, job.token, revision))
    ? { action: "complete" }
    : { action: "defer", delaySeconds: QUIET_WINDOW_SECONDS };
}
