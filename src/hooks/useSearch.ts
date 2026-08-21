import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { ApiError, requestJson } from "../lib/api";

type SearchResponse = {
  items: MediaTitle[];
  query: string;
};

export function useSearch(query: string, providerIds: string[]) {
  const [items, setItems] = useState<MediaTitle[]>([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const trimmed = query.trim();
  const providerKey = providerIds.join(",");

  const isShort = trimmed.length < 2;

  useEffect(() => {
    if (isShort) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      async function run() {
        setIsSearching(true);

        const parameters = new URLSearchParams({ query: trimmed });

        if (providerKey) {
          parameters.set("providers", providerKey);
        }

        try {
          const response = await requestJson<SearchResponse>(`/api/catalog/search?${parameters}`, {
            signal: controller.signal,
          });

          if (active) {
            setItems(response.items);
            setError("");
          }
        } catch (caught) {
          if (active && !(caught instanceof DOMException && caught.name === "AbortError")) {
            setItems([]);
            setError(caught instanceof ApiError ? caught.message : "Search is unavailable");
          }
        } finally {
          if (active) {
            setIsSearching(false);
          }
        }
      }

      void run();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isShort, providerKey, trimmed]);

  return {
    items: isShort ? [] : items,
    error: isShort ? "" : error,
    isSearching: isShort ? false : isSearching,
  };
}
