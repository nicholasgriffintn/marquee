import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

export type TitleInsight = {
  hook: string;
  moods: string[];
};

export type InsightPair = { item: MediaTitle; reason: string };

type InsightResponse = { insight: TitleInsight | null; pairs: InsightPair[] };

const NO_PAIRS: InsightPair[] = [];

export function useTitleInsight(titleId: string | null) {
  const { data, isLoading } = useResource<InsightResponse>(
    titleId ? `/api/curator/insight/${encodeURIComponent(titleId)}` : null,
  );

  return { insight: data?.insight ?? null, pairs: data?.pairs ?? NO_PAIRS, isLoading };
}
