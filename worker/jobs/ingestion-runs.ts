import { logEvent } from "../lib/logging.ts";
import type { Bindings, IngestionJob } from "../types.ts";

export function jobSubject(job: IngestionJob) {
  if (
    job.type === "enrich-availability" ||
    job.type === "enrich-ratings" ||
    job.type === "enrich-anime" ||
    job.type === "enrich-anilist" ||
    job.type === "enrich-anilist-media" ||
    job.type === "cache-poster"
  ) {
    return job.titleId;
  }

  if (job.type === "import-imdb-title") {
    return job.imdbId;
  }

  if (job.type === "import-trakt-history" || job.type === "push-trakt-shelf") {
    return job.viewerId;
  }

  if (job.type === "process-viewer-import" || job.type === "commit-viewer-import") {
    return job.runId;
  }

  if (job.type === "sync-discover-page") {
    return `${job.partitionId ?? job.mediaType}#${job.page}`;
  }

  if (job.type === "measure-discover-partition") {
    return job.partitionId;
  }

  if (job.type === "sync-cinemas") {
    return job.source;
  }

  if (job.type === "sync-cinema-screenings") {
    return `${job.source}:${job.siteId}`;
  }

  if (job.type === "sync-revival-source") {
    return job.collection ? `${job.source}:${job.collection}` : job.source;
  }

  if (job.type === "mirror-revival-work") {
    return job.workId;
  }

  return null;
}

export function startIngestionRun(
  transaction: DatabaseTransaction,
  runId: string,
  job: IngestionJob,
) {
  return transaction.execute(
    `INSERT INTO ingestion_runs (id, job_type, subject_id, status)
     VALUES ($1, $2, $3, 'running')`,
    [runId, job.type, jobSubject(job)],
  );
}

export async function completeIngestionRun(env: Bindings, runId: string) {
  await env.DB.execute(
    `UPDATE ingestion_runs
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [runId],
  );
}

export async function failIngestionRun(env: Bindings, runId: string, error: unknown) {
  const detail = error instanceof Error ? error.message.slice(0, 500) : "Unknown ingestion error";

  await env.DB.execute(
    `UPDATE ingestion_runs
     SET status = 'failed', error = $1, completed_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [detail, runId],
  );
}

const RUN_RETENTION_DAYS = 7;
const RUN_PRUNE_LIMIT = 20_000;
const RUN_PRUNE_MAX_BATCHES = 40;
const RUN_PRUNE_BUDGET_MS = 20_000;

export async function pruneIngestionRuns(env: Bindings) {
  const deadline = Date.now() + RUN_PRUNE_BUDGET_MS;
  let removed = 0;
  let batches = 0;

  while (batches < RUN_PRUNE_MAX_BATCHES) {
    // oxlint-disable-next-line no-await-in-loop -- bounded batches keep each delete short-lived
    const result = await env.DB.execute(
      `DELETE FROM ingestion_runs
       WHERE id IN (
         SELECT id FROM ingestion_runs
         WHERE started_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))
         LIMIT $2
       )`,
      [`-${RUN_RETENTION_DAYS} days`, RUN_PRUNE_LIMIT],
    );

    removed += result.rowCount;
    batches += 1;

    if (result.rowCount < RUN_PRUNE_LIMIT || Date.now() >= deadline) {
      break;
    }
  }

  logEvent("ingestion_runs_pruned", { removed, batches });

  return removed;
}
