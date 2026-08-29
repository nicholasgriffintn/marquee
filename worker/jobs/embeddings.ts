import { logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import { selectUnembedded } from "../services/embeddings.ts";
import type { Bindings, IngestionJob } from "../types.ts";

const EMBED_JOB_SIZE = 25;
const EMBED_PER_RUN = 2_000;

function embedJobs(titleIds: string[]): IngestionJob[] {
  const jobs: IngestionJob[] = [];

  for (let index = 0; index < titleIds.length; index += EMBED_JOB_SIZE) {
    jobs.push({ type: "embed-titles", titleIds: titleIds.slice(index, index + EMBED_JOB_SIZE) });
  }

  return jobs;
}

export async function queueEmbeddings(env: Bindings) {
  const titleIds = await selectUnembedded(env, EMBED_PER_RUN);

  logEvent("embeddings_queued", { titles: titleIds.length });

  await enqueue(env.EMBEDDING_QUEUE, embedJobs(titleIds));
}

export async function queueVectorReindex(env: Bindings) {
  logEvent("vector_reindex_queued", {});

  await enqueue(env.EMBEDDING_QUEUE, [{ type: "reindex-vectors" }]);
}

export async function queueTitleEmbeddings(env: Bindings, titleIds: string[]) {
  const unique = [...new Set(titleIds)];

  if (unique.length === 0) {
    return;
  }

  await enqueue(env.EMBEDDING_QUEUE, embedJobs(unique));
}
