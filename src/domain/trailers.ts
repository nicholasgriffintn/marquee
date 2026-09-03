import type { MediaTitle, TitleVideo } from "./catalog";

export const TRAILER_SORTS = ["latest", "trending"] as const;

export type TrailerSort = (typeof TRAILER_SORTS)[number];

export type TrailerCard = TitleVideo & {
  publishedAt: string;
  item: MediaTitle;
};

export type TrailersResponse = {
  sort: TrailerSort;
  trailers: TrailerCard[];
};

export const TRAILER_SORT_LABELS: Record<TrailerSort, string> = {
  latest: "Newest",
  trending: "Most watched",
};

export function isTrailerSort(value: unknown): value is TrailerSort {
  return typeof value === "string" && TRAILER_SORTS.includes(value as TrailerSort);
}

export type TrailerStillSize = "hq" | "maxres";

export function trailerStill(key: string, size: TrailerStillSize = "hq") {
  return `https://i.ytimg.com/vi/${encodeURIComponent(key)}/${size}default.jpg`;
}
