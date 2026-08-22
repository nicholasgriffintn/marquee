import type { IngestionJob } from "../types.ts";

const QUEUE_BATCH = 100;

export async function enqueue(queue: Queue<IngestionJob>, jobs: IngestionJob[]) {
  for (let index = 0; index < jobs.length; index += QUEUE_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    await queue.sendBatch(
      jobs.slice(index, index + QUEUE_BATCH).map((body) => ({ body, contentType: "json" })),
    );
  }
}
