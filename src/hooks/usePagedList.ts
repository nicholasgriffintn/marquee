import { useEffect, useState } from "react";

import { queryJson } from "../lib/query-client";

export type PagedResponse<T> = { items: T[]; hasMore: boolean; page: number };

export type PagedList<T> = {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  error: string;
  loadMore: () => void;
};

export function usePagedList<T>(path: string | null, errorMessage: string): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState("");
  const key = path ?? "";
  const page = pageState.key === key ? pageState.page : 0;
  const active = Boolean(path);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let alive = true;

    async function load() {
      setIsFetching(true);

      try {
        const separator = key.includes("?") ? "&" : "?";
        const response = await queryJson<PagedResponse<T>>(`${key}${separator}page=${page}`);

        if (!alive) {
          return;
        }

        setItems((current) => (page === 0 ? response.items : [...current, ...response.items]));
        setHasMore(response.hasMore);
        setError("");
      } catch {
        if (alive) {
          setError(errorMessage);
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
  }, [active, errorMessage, key, page]);

  return {
    items: active ? items : [],
    hasMore: active && hasMore,
    isLoading: active && isFetching,
    error: active ? error : "",
    loadMore: () => setPageState({ key, page: page + 1 }),
  };
}
