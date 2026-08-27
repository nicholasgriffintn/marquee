import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { isAbortError, requestJson } from "../lib/api";
import { useResource } from "./useResource";

const NO_FACETS: string[] = [];

export type BrowseFilters = {
  mediaType?: "movie" | "tv";
  sort: "trending" | "popularity" | "score" | "recent";
  genres: string[];
  keywords: string[];
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
    filters.keywords.join(","),
    filters.providerIds.join(","),
    filters.query.trim(),
  ].join("\u0000");
  const page = pageState.key === key ? pageState.page : 0;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(
      () => {
        async function load() {
          setIsLoading(true);

          const [mediaType, sort, genres, keywords, providers, query] = key.split("\u0000");
          const parameters = new URLSearchParams({ sort, page: String(page) });

          if (mediaType) {
            parameters.set("mediaType", mediaType);
          }

          if (genres) {
            parameters.set("genres", genres);
          }

          if (keywords) {
            parameters.set("keywords", keywords);
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
            if (active && !isAbortError(caught)) {
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

export function useKeywords(limit: number) {
  const { data } = useResource<{ keywords: string[] }>(`/api/catalog/keywords?limit=${limit}`);

  return data?.keywords ?? NO_FACETS;
}

export function useGenres(limit: number) {
  const { data } = useResource<{ genres: string[] }>(`/api/catalog/genres?limit=${limit}`);

  return data?.genres ?? NO_FACETS;
}
