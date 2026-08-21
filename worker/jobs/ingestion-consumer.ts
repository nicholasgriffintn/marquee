import { isIngestionJob } from "../lib/validation.ts";
import type { Bindings } from "../types.ts";
import { recordIngestionRun } from "./ingestion-runs.ts";

export async function consumeIngestion(batch: MessageBatch<unknown>, env: Bindings) {
  for (const message of batch.messages) {
    if (!isIngestionJob(message.body)) {
      console.error(JSON.stringify({ event: "invalid_ingestion_job", messageId: message.id }));
      message.ack();
      continue;
    }

    try {
      await recordIngestionRun(env, message.body);
      message.ack();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "ingestion_job_failed",
          jobType: message.body.type,
          subjectId: message.body.type === "enrich-availability" ? message.body.titleId : null,
          attempt: message.attempts,
          kind: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      message.retry({ delaySeconds: Math.min(300, 30 * message.attempts) });
    }
  }
}
