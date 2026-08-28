import type { MediaTitle, SourceWork } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];

type AdaptationsResponse = { source: SourceWork | null; items: MediaTitle[] };

export function useAdaptations(titleId: string) {
  const { data } = useResource<AdaptationsResponse>(
    `/api/catalog/titles/${encodeURIComponent(titleId)}/adaptations`,
  );

  return { source: data?.source ?? null, items: data?.items ?? NO_ITEMS };
}
