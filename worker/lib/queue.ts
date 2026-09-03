import type { IngestionJob } from "../types.ts";

const QUEUE_BATCH = 100;
const QUEUE_PARALLEL = 3;
const OVERLOAD_ATTEMPTS = 4;
const OVERLOAD_BASE_DELAY_MS = 1_000;

function isOverloaded(error: unknown) {
  return error instanceof Error && /overloaded|10250/iu.test(error.message);
}

async function sendBatch(queue: Queue<IngestionJob>, batch: IngestionJob[]) {
  const messages = batch.map((body) => ({ body, contentType: "json" as const }));

  for (let attempt = 0; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await queue.sendBatch(messages);

      return;
    } catch (error) {
      if (!isOverloaded(error) || attempt >= OVERLOAD_ATTEMPTS - 1) {
        throw error;
      }

      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, OVERLOAD_BASE_DELAY_MS * 2 ** attempt);
      });
    }
  }
}

export async function enqueue(queue: Queue<IngestionJob>, jobs: IngestionJob[]) {
  const batches: IngestionJob[][] = [];

  for (let index = 0; index < jobs.length; index += QUEUE_BATCH) {
    batches.push(jobs.slice(index, index + QUEUE_BATCH));
  }

  for (let index = 0; index < batches.length; index += QUEUE_PARALLEL) {
    // oxlint-disable-next-line no-await-in-loop
    await Promise.all(
      batches.slice(index, index + QUEUE_PARALLEL).map((batch) => sendBatch(queue, batch)),
    );
  }
}
