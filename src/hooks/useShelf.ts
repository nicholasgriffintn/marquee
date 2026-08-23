import { useCallback, useEffect, useState } from "react";

import type { ShelfItem, ShelfResponse } from "../domain/shelf";
import { requestJson } from "../lib/api";

const NO_ITEMS: ShelfItem[] = [];
const NO_GENRES: string[] = [];
const EMPTY_SET: ReadonlySet<string> = new Set();

export type ShelfFilters = {
  sort: string;
  status: string;
  genre: string;
  query: string;
};

function toSearch(filters: ShelfFilters, page: number) {
  const params = new URLSearchParams({ sort: filters.sort, page: String(page) });

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.genre) {
    params.set("genre", filters.genre);
  }

  if (filters.query) {
    params.set("q", filters.query);
  }

  return params.toString();
}

export function useShelf(isSignedIn: boolean, filters: ShelfFilters) {
  const key = toSearch(filters, 0);
  const [loaded, setLoaded] = useState<{
    key: string;
    pages: ShelfResponse[];
  } | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [settled, setSettled] = useState<{
    key: string;
    claimed: ReadonlySet<string>;
    discarded: ReadonlySet<string>;
  } | null>(null);
  const live = loaded?.key === key ? loaded : null;
  const first = live?.pages[0] ?? null;
  const claimed = settled?.key === key ? settled.claimed : EMPTY_SET;
  const discarded = settled?.key === key ? settled.discarded : EMPTY_SET;

  const note = useCallback(
    (titleId: string, binned: boolean) =>
      setSettled((current) => {
        const base =
          current?.key === key ? current : { key, claimed: EMPTY_SET, discarded: EMPTY_SET };

        return {
          key,
          claimed: new Set([...base.claimed, titleId]),
          discarded: binned ? new Set([...base.discarded, titleId]) : base.discarded,
        };
      }),
    [key],
  );

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<ShelfResponse>(`/api/profile/shelf?${key}`, {
          signal: controller.signal,
        });

        setLoaded({ key, pages: [response] });
        setError("");
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError("Your shelf is out of reach for a moment.");
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn, key]);

  const last = live?.pages[live.pages.length - 1] ?? null;

  const loadMore = useCallback(async () => {
    if (!last?.hasMore || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const response = await requestJson<ShelfResponse>(
        `/api/profile/shelf?${toSearch(filters, last.page + 1)}`,
      );

      setLoaded((current) =>
        current?.key === key ? { key, pages: [...current.pages, response] } : current,
      );
    } catch {
      setError("That page would not come off the shelf.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, isLoadingMore, key, last]);

  const items = live
    ? live.pages.flatMap((page) => page.items).filter((item) => !discarded.has(item.entry.titleId))
    : NO_ITEMS;

  return {
    items,
    lost: (first?.lost ?? NO_ITEMS).filter((item) => !claimed.has(item.entry.titleId)),
    genres: first?.genres ?? NO_GENRES,
    matched: Math.max(0, (first?.matched ?? 0) - discarded.size),
    shelved: Math.max(0, (first?.shelved ?? 0) - discarded.size),
    hasMore: last?.hasMore ?? false,
    isLoading: isSignedIn && !live,
    isLoadingMore,
    error,
    loadMore,
    note,
  };
}
