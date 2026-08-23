import type { EntryStatus, ViewingEntry } from "../types";
import type { MediaTitle } from "./catalog";

export const SHELF_SORTS = ["added", "rating", "status", "year", "genre"] as const;

export type ShelfSort = (typeof SHELF_SORTS)[number];

export const SHELF_PAGE_SIZE = 60;

export type ShelfItem = { entry: ViewingEntry; title: MediaTitle };

export type ShelfResponse = {
  items: ShelfItem[];
  lost: ShelfItem[];
  genres: string[];
  matched: number;
  shelved: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export function isShelfSort(value: unknown): value is ShelfSort {
  return typeof value === "string" && SHELF_SORTS.includes(value as ShelfSort);
}

export function shelfStatus(value: unknown): EntryStatus | null {
  return value === "watchlist" || value === "watching" || value === "watched" || value === "dropped"
    ? value
    : null;
}
