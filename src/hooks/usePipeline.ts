import { useEffect, useState } from "react";

import { requestJson } from "../lib/api";

export type PipelineHealth = {
  failures: {
    jobType: string;
    subjectId: string | null;
    error: string | null;
    startedAt: string;
  }[];
  lastRuns: { jobType: string; lastRunAt: string; runs: number }[];
  budgets: { source: string; callLimit: number; used: number; windowKind: string }[];
  fetchedAt: string;
};

export function usePipeline() {
  const [health, setHealth] = useState<PipelineHealth | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    requestJson<PipelineHealth>("/api/catalog/pipeline", { signal: controller.signal })
      .then(setHealth)
      .catch(() => setHealth(null));

    return () => controller.abort();
  }, []);

  return health;
}
