import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { shouldRefineSearch } from "../domain/search-query";
import { startJourneys } from "../lib/journey";
import { cancelJsonQuery, queryJson, QueryError } from "../lib/query-client";

type SearchResponse = {
  items: MediaTitle[];
  query: string;
  journey?: string;
};

const KEYWORD_DEBOUNCE_MS = 300;
const HYBRID_SETTLE_MS = 400;
const MIN_QUERY_LENGTH = 3;

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

export function useSearch(query: string, providerIds: string[], enabled: boolean) {
  const [items, setItems] = useState<MediaTitle[]>([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const served = useRef<MediaTitle[]>([]);
  const trimmed = query.trim();
  const providerKey = providerIds.join(",");

  const serve = useCallback((next: MediaTitle[], journey: string | undefined) => {
    served.current = next;
    setItems(next);
    startJourneys(next, journey);
  }, []);

  const isIdle = !enabled || trimmed.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    if (isIdle) {
      return undefined;
    }

    const keywordPath = searchUrl(trimmed, providerKey, false);
    const hybridPath = searchUrl(trimmed, providerKey, true);
    let active = true;
    let hybridTimer: number | undefined;

    async function refine() {
      try {
        const response = await queryJson<SearchResponse>(hybridPath);

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
          const response = await queryJson<SearchResponse>(keywordPath);

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

      void cancelJsonQuery(keywordPath);
      void cancelJsonQuery(hybridPath);
    };
  }, [isIdle, providerKey, serve, trimmed]);

  return {
    items: isIdle ? [] : items,
    error: isIdle ? "" : error,
    isSearching: isIdle ? false : isSearching,
    isRefining: isIdle ? false : isRefining,
  };
}
