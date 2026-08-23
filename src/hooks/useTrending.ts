import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];

export function useTrending(isReady: boolean) {
  const { data } = useResource<{ items: MediaTitle[] }>("/api/catalog/trending", {
    enabled: isReady,
  });

  return data?.items ?? NO_ITEMS;
}
