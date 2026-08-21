import type { Bindings, IngestionJob } from "../types.ts";
import { executeIngestionJob } from "./ingestion.ts";

export async function recordIngestionRun(env: Bindings, job: IngestionJob) {
  const runId = crypto.randomUUID();
  const subjectId = job.type === "enrich-availability" ? job.titleId : null;

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
