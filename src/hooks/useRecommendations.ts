import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];

export function useRecommendations(titleId: string, ids: string[] | undefined, limit: number) {
  const key = (ids ?? [])
    .filter((id) => id !== titleId)
    .slice(0, limit)
    .join(",");
  const { data } = useResource<{ items: MediaTitle[] }>(
    key ? `/api/catalog/items?ids=${encodeURIComponent(key)}` : null,
  );

  return data?.items ?? NO_ITEMS;
}
