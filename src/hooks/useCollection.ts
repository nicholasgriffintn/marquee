import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { queryJson } from "../lib/query-client";
import { useResource } from "./useResource";

const NO_ITEMS: MediaTitle[] = [];

type CollectionResponse = { items: MediaTitle[]; hasMore: boolean; page: number };

export function useCollection(collectionId: number | null | undefined) {
  const { data } = useResource<CollectionResponse>(
    collectionId ? `/api/catalog/collections/${collectionId}` : null,
  );

  return { items: data?.items ?? NO_ITEMS, hasMore: data?.hasMore ?? false };
}

export function useCollectionPage(collectionId: number | null) {
  const [items, setItems] = useState<MediaTitle[]>(NO_ITEMS);
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState("");
  const key = String(collectionId ?? "");
  const page = pageState.key === key ? pageState.page : 0;
  const active = Boolean(collectionId);

  useEffect(() => {
    if (!active || !collectionId) {
      return undefined;
    }

    let alive = true;

    async function load() {
      setIsFetching(true);

      try {
        const response = await queryJson<CollectionResponse>(
          `/api/catalog/collections/${collectionId}?page=${page}`,
        );

        if (!alive) {
          return;
        }

        setItems((current) => (page === 0 ? response.items : [...current, ...response.items]));
        setHasMore(response.hasMore);
        setError("");
      } catch {
        if (alive) {
          setError("Could not load this collection.");
        }
      } finally {
        if (alive) {
          setIsFetching(false);
        }
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [active, collectionId, page]);

  return {
    items: active ? items : NO_ITEMS,
    hasMore: active && hasMore,
    isLoading: active && isFetching,
    error: active ? error : "",
    loadMore: () => setPageState({ key, page: page + 1 }),
  };
}
