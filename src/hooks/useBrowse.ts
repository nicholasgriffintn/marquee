import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

export type BrowseFilters = {
  mediaType?: "movie" | "tv";
  sort: "popularity" | "score" | "recent";
  genres: string[];
  providerIds: string[];
  query: string;
};

type BrowseResponse = {
  items: MediaTitle[];
  hasMore: boolean;
  page: number;
};

export function useBrowse(filters: BrowseFilters) {
  const [items, setItems] = useState<MediaTitle[]>([]);
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const key = [
    filters.mediaType ?? "",
    filters.sort,
    filters.genres.join(","),
    filters.providerIds.join(","),
    filters.query.trim(),
  ].join("|");
  const page = pageState.key === key ? pageState.page : 0;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(
      () => {
        async function load() {
          setIsLoading(true);

          const [mediaType, sort, genres, providers, query] = key.split("|");
          const parameters = new URLSearchParams({ sort, page: String(page) });

          if (mediaType) {
            parameters.set("mediaType", mediaType);
          }

          if (genres) {
            parameters.set("genres", genres);
          }

          if (providers) {
            parameters.set("providers", providers);
          }

          if (query) {
            parameters.set("query", query);
          }

          try {
            const response = await requestJson<BrowseResponse>(
              `/api/catalog/browse?${parameters}`,
              { signal: controller.signal },
            );

            if (!active) {
              return;
            }

            setItems((current) =>
              response.page === 0 ? response.items : [...current, ...response.items],
            );
            setHasMore(response.hasMore);
            setError("");
          } catch (caught) {
            if (active && !(caught instanceof DOMException && caught.name === "AbortError")) {
              setError("Could not load titles");
            }
          } finally {
            if (active) {
              setIsLoading(false);
            }
          }
        }

        void load();
      },
      page === 0 ? 200 : 0,
    );

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, page]);

  return {
    items,
    hasMore,
    isLoading,
    error,
    loadMore: () => setPageState({ key, page: page + 1 }),
  };
}

export function useGenres() {
  const [genres, setGenres] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      try {
        const response = await requestJson<{ genres: string[] }>("/api/catalog/genres", {
          signal: controller.signal,
        });

        if (active) {
          setGenres(response.genres);
        }
      } catch {
        if (active) {
          setGenres([]);
        }
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return genres;
}
