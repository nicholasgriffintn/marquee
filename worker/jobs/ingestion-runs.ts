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

  if (job.type === "import-trakt-history") {
    return job.viewerId;
  }

  if (job.type === "sync-discover-page") {
    return `${job.mediaType}#${job.page}`;
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
