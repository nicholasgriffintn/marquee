import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];
const TRENDING_STALE_MS = 30 * 60_000;

export function useTrending(isReady: boolean) {
  const { data } = useResource<{ items: MediaTitle[] }>("/api/catalog/trending", {
    enabled: isReady,
    staleTime: TRENDING_STALE_MS,
  });

  return data?.items ?? NO_ITEMS;
}
