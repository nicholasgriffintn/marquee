import { isIngestionJob } from "../lib/validation.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import { jobSubject, recordIngestionRun } from "./ingestion-runs.ts";

function errorStatus(error: unknown) {
  if (error instanceof Error && "status" in error) {
    const status = (error as { status?: unknown }).status;

    return typeof status === "number" ? status : null;
  }

  return null;
}

export async function consumeIngestion(batch: MessageBatch<unknown>, env: Bindings) {
  for (const message of batch.messages) {
    if (!isIngestionJob(message.body)) {
      console.error(JSON.stringify({ event: "invalid_ingestion_job", messageId: message.id }));
      message.ack();
      continue;
    }

    try {
      // oxlint-disable-next-line no-await-in-loop
      await recordIngestionRun(env, message.body);
      message.ack();
    } catch (error) {
      const status = errorStatus(error);
      const permanent = status !== null && status >= 400 && status < 500 && status !== 429;

      console.error(
        JSON.stringify({
          event: "ingestion_job_failed",
          jobType: message.body.type,
          subjectId: jobSubject(message.body),
          attempt: message.attempts,
          kind: error instanceof Error ? error.name : "UnknownError",
          status,
          permanent,
          detail:
            error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
        }),
      );

      if (permanent) {
        message.ack();
        continue;
      }

      message.retry({
        delaySeconds:
          status === 429
            ? Math.min(900, 180 * message.attempts)
            : Math.min(300, 30 * message.attempts),
      });
    }
  }
}

export async function consumeDeadLetters(batch: MessageBatch<unknown>, env: Bindings) {
  const statements = batch.messages.map((message) => {
    const job: IngestionJob | null = isIngestionJob(message.body) ? message.body : null;

    return env.DB.prepare(
      `INSERT INTO ingestion_runs (id, job_type, subject_id, status, error, completed_at)
       VALUES (?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)`,
    ).bind(
      crypto.randomUUID(),
      `dead-letter:${job?.type ?? "unknown"}`,
      job ? jobSubject(job) : null,
      `Gave up after ${message.attempts} attempt${message.attempts === 1 ? "" : "s"}`,
    );
  });

  if (statements.length) {
    await env.DB.batch(statements);
  }

  console.error(JSON.stringify({ event: "dead_letters_recorded", count: statements.length }));

  for (const message of batch.messages) {
    message.ack();
  }
}
