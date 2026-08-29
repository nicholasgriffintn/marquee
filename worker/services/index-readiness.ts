import { logError, logEvent } from "../lib/logging.ts";
import {
  projectTitles,
  queueSearchRebuild,
  readSearchIndexState,
  sampleSearchDrift,
  takePendingTitles,
} from "../repositories/catalog-index.ts";
import type { Bindings } from "../types.ts";
import { type EmbeddingCoverage, readEmbeddingCoverage } from "./embeddings.ts";

export const RECONCILE_LIMIT = 2_000;
export const DEEP_RECONCILE_LIMIT = 8_000;

export type IndexReadiness = {
  search: {
    titles: number;
    indexed: number;
    pending: number;
    oldestPendingAt: string | null;
    sampled: number;
    stale: number;
  };
  embeddings: EmbeddingCoverage;
};

export async function reconcileSearchIndex(env: Bindings, limit = RECONCILE_LIMIT) {
  const titleIds = await takePendingTitles(env.DB, limit);
  const projected = await projectTitles(env.DB, titleIds);
  const state = await readSearchIndexState(env.DB);

  logEvent("search_index_reconciled", {
    projected,
    pending: state.pending,
    indexed: state.indexed,
  });

  return { projected, pending: state.pending };
}

export async function rebuildSearchIndex(env: Bindings) {
  const pending = await queueSearchRebuild(env.DB);

  logEvent("search_index_rebuild_queued", { pending });

  return pending;
}

export async function readIndexReadiness(env: Bindings): Promise<IndexReadiness> {
  const [search, drift, embeddings] = await Promise.all([
    readSearchIndexState(env.DB),
    sampleSearchDrift(env.DB).catch((error: unknown) => {
      logError("search_drift_sample_failed", error);

      return { sampled: 0, stale: 0 };
    }),
    readEmbeddingCoverage(env),
  ]);

  return { search: { ...search, ...drift }, embeddings };
}
