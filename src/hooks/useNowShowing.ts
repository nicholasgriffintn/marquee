import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];

export function useNowShowing(isReady: boolean) {
  const { data } = useResource<{ items: MediaTitle[] }>(
    "/api/catalog/browse?mediaType=movie&sort=popularity",
    { enabled: isReady },
  );

  return data?.items ?? NO_ITEMS;
}
