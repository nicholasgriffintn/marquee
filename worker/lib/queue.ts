import type { IngestionJob } from "../types.ts";

const QUEUE_BATCH = 100;
const QUEUE_PARALLEL = 6;

export async function enqueue(queue: Queue<IngestionJob>, jobs: IngestionJob[]) {
  const batches: IngestionJob[][] = [];

  for (let index = 0; index < jobs.length; index += QUEUE_BATCH) {
    batches.push(jobs.slice(index, index + QUEUE_BATCH));
  }

  for (let index = 0; index < batches.length; index += QUEUE_PARALLEL) {
    // oxlint-disable-next-line no-await-in-loop
    await Promise.all(
      batches
        .slice(index, index + QUEUE_PARALLEL)
        .map((batch) =>
          queue.sendBatch(batch.map((body) => ({ body, contentType: "json" as const }))),
        ),
    );
  }
}
