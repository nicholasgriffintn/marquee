import { logEvent } from "../lib/logging.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import { executeIngestionJob } from "./ingestion.ts";

export function jobSubject(job: IngestionJob) {
  if (
    job.type === "enrich-availability" ||
    job.type === "enrich-ratings" ||
    job.type === "enrich-simkl" ||
    job.type === "enrich-anilist" ||
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

  if (job.type === "import-diary-row") {
    return `${job.viewerId}#${job.name.slice(0, 40)}`;
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

export async function recordIngestionRun(env: Bindings, job: IngestionJob) {
  const runId = crypto.randomUUID();
  const subjectId = jobSubject(job);

  await env.DB.prepare(
    `INSERT INTO ingestion_runs (id, job_type, subject_id, status)
     VALUES (?, ?, ?, 'running')`,
  )
    .bind(runId, job.type, subjectId)
    .run();

  try {
    await executeIngestionJob(env, job);
    await env.DB.prepare(
      `UPDATE ingestion_runs
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(runId)
      .run();
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "Unknown ingestion error";

    await env.DB.prepare(
      `UPDATE ingestion_runs
       SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(detail, runId)
      .run();
    throw error;
  }
}

const RUN_RETENTION_DAYS = 7;
const RUN_PRUNE_LIMIT = 20_000;

export async function pruneIngestionRuns(env: Bindings) {
  const result = await env.DB.prepare(
    `DELETE FROM ingestion_runs
     WHERE id IN (
       SELECT id FROM ingestion_runs
       WHERE started_at < datetime('now', ?)
       LIMIT ?
     )`,
  )
    .bind(`-${RUN_RETENTION_DAYS} days`, RUN_PRUNE_LIMIT)
    .run();

  logEvent("ingestion_runs_pruned", { removed: result.meta.changes });

  return result.meta.changes;
}
