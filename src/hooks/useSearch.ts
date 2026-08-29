import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { shouldRefineSearch } from "../domain/search-query";
import { startJourneys } from "../lib/journey";
import { queryJson, QueryError } from "../lib/query-client";

type SearchResponse = {
  items: MediaTitle[];
  query: string;
  journey?: string;
};

const KEYWORD_DEBOUNCE_MS = 250;
const HYBRID_SETTLE_MS = 400;

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
  const served = useRef<MediaTitle[]>([]);
  const trimmed = query.trim();
  const providerKey = providerIds.join(",");

  // Results carry the ticket the server signed for this response, so a title
  // opened from here is attributed to the search that surfaced it and at what rank.
  const serve = useCallback((next: MediaTitle[], journey: string | undefined) => {
    served.current = next;
    setItems(next);
    startJourneys(next, journey);
  }, []);

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
          serve(mergeRefined(served.current, response.items), response.journey);
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
            serve(response.items, response.journey);
            setError("");

            if (shouldRefineSearch(trimmed, response.items)) {
              setIsRefining(true);
              hybridTimer = window.setTimeout(() => void refine(), HYBRID_SETTLE_MS);
            }
          }
        } catch (caught) {
          if (active) {
            serve([], undefined);
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
  }, [isShort, providerKey, serve, trimmed]);

  return {
    items: isShort ? [] : items,
    error: isShort ? "" : error,
    isSearching: isShort ? false : isSearching,
    isRefining: isShort ? false : isRefining,
  };
}
