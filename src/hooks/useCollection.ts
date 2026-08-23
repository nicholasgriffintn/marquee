import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];

export function useCollection(collectionId: number | null | undefined) {
  const { data } = useResource<{ items: MediaTitle[] }>(
    collectionId ? `/api/catalog/collections/${collectionId}` : null,
  );

  return data?.items ?? NO_ITEMS;
}
