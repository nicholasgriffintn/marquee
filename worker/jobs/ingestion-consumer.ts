import { errorStatus, isPermanentHttpStatus } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isIngestionJob } from "../lib/validation.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import {
  completeIngestionRun,
  failIngestionRun,
  jobSubject,
  startIngestionRun,
} from "./ingestion-runs.ts";
import { executeIngestionJob } from "./ingestion.ts";

function handleIngestionFailure(
  message: Message<unknown>,
  job: IngestionJob,
  error: unknown,
): void {
  const status = errorStatus(error);
  const permanent = isPermanentHttpStatus(status);

  console.error(
    JSON.stringify({
      event: "ingestion_job_failed",
      jobType: job.type,
      subjectId: jobSubject(job),
      attempt: message.attempts,
      kind: error instanceof Error ? error.name : "UnknownError",
      status,
      permanent,
      detail:
        error instanceof Error
          ? error.message.slice(0, 300)
          : String(error).slice(0, 300),
    }),
  );

  if (permanent) {
    message.ack();

    return;
  }

  message.retry({
    delaySeconds:
      status === 429
        ? Math.min(900, 180 * message.attempts)
        : Math.min(300, 30 * message.attempts),
  });
}

export async function consumeIngestion(
  batch: MessageBatch<unknown>,
  env: Bindings,
) {
  const runs: {
    message: Message<unknown>;
    job: IngestionJob;
    runId: string;
  }[] = [];

  for (const message of batch.messages) {
    if (!isIngestionJob(message.body)) {
      console.error(
        JSON.stringify({
          event: "invalid_ingestion_job",
          messageId: message.id,
        }),
      );
      message.ack();
      continue;
    }

    runs.push({ message, job: message.body, runId: crypto.randomUUID() });
  }

  if (runs.length) {
    try {
      await env.DB.transaction(async (transaction) => {
        for (const { job, runId } of runs) {
          // oxlint-disable-next-line no-await-in-loop
          await startIngestionRun(transaction, runId, job);
        }
      });
    } catch (error) {
      for (const { message, job } of runs) {
        handleIngestionFailure(message, job, error);
      }

      return;
    }
  }

  for (const { message, job, runId } of runs) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await executeIngestionJob(env, job);
    } catch (error) {
      // oxlint-disable-next-line no-await-in-loop
      await failIngestionRun(env, runId, error);
      handleIngestionFailure(message, job, error);
      continue;
    }

    message.ack();

    try {
      // oxlint-disable-next-line no-await-in-loop
      await completeIngestionRun(env, runId);
    } catch (error) {
      logError("ingestion_run_complete_failed", error, {
        jobType: job.type,
        subjectId: jobSubject(job),
        runId,
      });
    }
  }
}

export async function consumeDeadLetters(
  batch: MessageBatch<unknown>,
  env: Bindings,
) {
  try {
    if (batch.messages.length) {
      await env.DB.transaction(async (transaction) => {
        for (const message of batch.messages) {
          const job: IngestionJob | null = isIngestionJob(message.body)
            ? message.body
            : null;

          // oxlint-disable-next-line no-await-in-loop
          await transaction.execute(
            `INSERT INTO ingestion_runs (id, job_type, subject_id, status, error, completed_at)
             VALUES ($1, $2, $3, 'failed', $4, CURRENT_TIMESTAMP)`,
            [
              crypto.randomUUID(),
              `dead-letter:${job?.type ?? "unknown"}`,
              job ? jobSubject(job) : null,
              `Gave up after ${message.attempts} attempt${message.attempts === 1 ? "" : "s"}`,
            ],
          );
        }
      });
    }

    console.error(
      JSON.stringify({
        event: "dead_letters_recorded",
        count: batch.messages.length,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "dead_letters_record_failed",
        count: batch.messages.length,
        detail:
          error instanceof Error
            ? error.message.slice(0, 300)
            : String(error).slice(0, 300),
      }),
    );
  }

  for (const message of batch.messages) {
    message.ack();
  }
}
