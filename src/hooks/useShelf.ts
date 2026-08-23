import { useCallback, useState } from "react";

import type { ShelfItem, ShelfResponse } from "../domain/shelf";
import { requestJson } from "../lib/api";
import { useResource } from "./useResource";

const NO_ITEMS: ShelfItem[] = [];
const NO_GENRES: string[] = [];
const NO_PAGES: ShelfResponse[] = [];
const EMPTY_SET: ReadonlySet<string> = new Set();

export type ShelfFilters = {
  sort: string;
  status: string;
  genre: string;
  query: string;
};

type Marked = { key: string; claimed: ReadonlySet<string>; discarded: ReadonlySet<string> };

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
  const [extra, setExtra] = useState<{ key: string; pages: ShelfResponse[] } | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const [marked, setMarked] = useState<Marked | null>(null);
  const first = useResource<ShelfResponse>(`/api/profile/shelf?${key}`, {
    enabled: isSignedIn,
    errorMessage: "Your shelf is out of reach for a moment.",
  });
  const head = first.data;
  const pages = extra?.key === key ? extra.pages : NO_PAGES;
  const claimed = marked?.key === key ? marked.claimed : EMPTY_SET;
  const discarded = marked?.key === key ? marked.discarded : EMPTY_SET;
  const last = pages[pages.length - 1] ?? head;

  const note = useCallback(
    (titleId: string, binned: boolean) =>
      setMarked((current) => {
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

  const loadMore = useCallback(async () => {
    if (!last?.hasMore || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const response = await requestJson<ShelfResponse>(
        `/api/profile/shelf?${toSearch(filters, last.page + 1)}`,
      );

      setExtra((current) => ({
        key,
        pages: current?.key === key ? [...current.pages, response] : [response],
      }));
    } catch {
      setPageError("That page would not come off the shelf.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, isLoadingMore, key, last]);

  const items = head
    ? [head, ...pages]
        .flatMap((page) => page.items)
        .filter((item) => !discarded.has(item.entry.titleId))
    : NO_ITEMS;

  return {
    items,
    lost: (head?.lost ?? NO_ITEMS).filter((item) => !claimed.has(item.entry.titleId)),
    genres: head?.genres ?? NO_GENRES,
    matched: Math.max(0, (head?.matched ?? 0) - discarded.size),
    shelved: Math.max(0, (head?.shelved ?? 0) - discarded.size),
    hasMore: last?.hasMore ?? false,
    isLoading: isSignedIn && !head,
    isLoadingMore,
    error: pageError || first.error,
    loadMore,
    note,
  };
}
