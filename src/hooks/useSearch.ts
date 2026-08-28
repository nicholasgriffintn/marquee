import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { queryJson, QueryError } from "../lib/query-client";

type SearchResponse = {
  items: MediaTitle[];
  query: string;
};

const KEYWORD_DEBOUNCE_MS = 250;
const HYBRID_SETTLE_MS = 400;
const HYBRID_TRIGGER_MAX_ITEMS = 6;

function searchUrl(trimmed: string, providerKey: string, hybrid: boolean) {
  const parameters = new URLSearchParams({ query: trimmed });

  if (providerKey) {
    parameters.set("providers", providerKey);
  }

  if (hybrid) {
    parameters.set("mode", "hybrid");
  }

  return `/api/catalog/search?${parameters}`;
}

function mergeRefined(current: MediaTitle[], refined: MediaTitle[]) {
  const seen = new Set(refined.map((item) => item.id));

  return [...refined, ...current.filter((item) => !seen.has(item.id))];
}

export function useSearch(query: string, providerIds: string[]) {
  const [items, setItems] = useState<MediaTitle[]>([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const trimmed = query.trim();
  const providerKey = providerIds.join(",");

  const isShort = trimmed.length < 2;

  useEffect(() => {
    if (isShort) {
      return undefined;
    }

    let active = true;
    let hybridTimer: number | undefined;

    async function refine() {
      try {
        const response = await queryJson<SearchResponse>(searchUrl(trimmed, providerKey, true));

        if (active) {
          setItems((current) => mergeRefined(current, response.items));
        }
      } catch {
      } finally {
        if (active) {
          setIsRefining(false);
        }
      }
    }

    const timer = window.setTimeout(() => {
      async function run() {
        setIsSearching(true);
        setIsRefining(false);

        try {
          const response = await queryJson<SearchResponse>(searchUrl(trimmed, providerKey, false));

          if (active) {
            setItems(response.items);
            setError("");

            if (response.items.length < HYBRID_TRIGGER_MAX_ITEMS) {
              setIsRefining(true);
              hybridTimer = window.setTimeout(() => void refine(), HYBRID_SETTLE_MS);
            }
          }
        } catch (caught) {
          if (active) {
            setItems([]);
            setError(caught instanceof QueryError ? caught.message : "Search is unavailable");
          }
        } finally {
          if (active) {
            setIsSearching(false);
          }
        }
      }

      void run();
    }, KEYWORD_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);

      if (hybridTimer !== undefined) {
        window.clearTimeout(hybridTimer);
      }
    };
  }, [isShort, providerKey, trimmed]);

  return {
    items: isShort ? [] : items,
    error: isShort ? "" : error,
    isSearching: isShort ? false : isSearching,
    isRefining: isShort ? false : isRefining,
  };
}
