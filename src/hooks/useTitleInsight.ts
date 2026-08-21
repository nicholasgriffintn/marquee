import { useEffect, useState } from "react";

import { requestJson } from "../lib/api";

export type TitleInsight = {
  hook: string;
  moods: string[];
  pairs: { titleId: string; reason: string }[];
};

export function useTitleInsight(titleId: string | null, enabled: boolean) {
  const [insight, setInsight] = useState<TitleInsight | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!titleId || !enabled) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function load() {
      setIsLoading(true);

      try {
        const response = await requestJson<{ insight: TitleInsight | null }>(
          `/api/curator/insight/${encodeURIComponent(titleId as string)}`,
          { signal: controller.signal },
        );

        if (active) {
          setInsight(response.insight);
        }
      } catch {
        if (active) {
          setInsight(null);
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
  }, [enabled, titleId]);

  return { insight, isLoading };
}
