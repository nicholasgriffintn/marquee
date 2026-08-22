import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

export type TitleInsight = {
  hook: string;
  moods: string[];
};

export type InsightPair = { item: MediaTitle; reason: string };

export function useTitleInsight(titleId: string | null) {
  const [insight, setInsight] = useState<TitleInsight | null>(null);
  const [pairs, setPairs] = useState<InsightPair[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!titleId) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function load() {
      setIsLoading(true);

      try {
        const response = await requestJson<{ insight: TitleInsight | null; pairs: InsightPair[] }>(
          `/api/curator/insight/${encodeURIComponent(titleId as string)}`,
          { signal: controller.signal },
        );

        if (active) {
          setInsight(response.insight);
          setPairs(response.pairs ?? []);
        }
      } catch {
        if (active) {
          setInsight(null);
          setPairs([]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [titleId]);

  return { insight, pairs, isLoading };
}
