import { useEffect, useMemo, useState } from "react";

import type { CatalogResponse, MediaTitle, Provider, ProvidersResponse } from "../domain/catalog";
import { ApiError, requestJson } from "../lib/api";

const emptyCatalogue: CatalogResponse = {
  sections: [],
  source: "TMDB",
  availabilitySource: "JustWatch via TMDB",
  fetchedAt: "",
};

const emptyProviderStats: ProvidersResponse["stats"] = {
  configured: 0,
  feeds: 0,
  links: 0,
  markers: 0,
  longTail: 0,
};

function message(error: unknown) {
  return error instanceof ApiError ? error.message : "Live catalogue is unavailable";
}

export function useCatalog(query: string, providerIds: string[], savedIds: string[]) {
  const [catalogue, setCatalogue] = useState<CatalogResponse>(emptyCatalogue);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSources, setProviderSources] = useState<string[]>([]);
  const [providerStats, setProviderStats] = useState(emptyProviderStats);
  const [savedTitles, setSavedTitles] = useState<MediaTitle[]>([]);
  const [error, setError] = useState("");
  const [providerError, setProviderError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProviders() {
      try {
        const response = await requestJson<ProvidersResponse>("/api/catalog/providers", {
          signal: controller.signal,
        });

        setProviders(response.providers);
        setProviderSources(response.sources);
        setProviderStats(response.stats);
        setProviderError(response.errors.join(". "));
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setProviderError(message(caught));
        }
      }
    }

    void loadProviders();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(
      () => {
        async function loadCatalogue() {
          setIsLoading(true);
          const parameters = new URLSearchParams();

          if (query.trim()) {
            parameters.set("query", query.trim());
          }

          if (providerIds.length) {
            parameters.set("providers", providerIds.join(","));
          }

          try {
            const response = await requestJson<CatalogResponse>(`/api/catalog?${parameters}`, {
              signal: controller.signal,
            });

            if (!active) {
              return;
            }

            setCatalogue(response);
            setError("");
          } catch (caught) {
            if (active && !(caught instanceof DOMException && caught.name === "AbortError")) {
              setCatalogue(emptyCatalogue);
              setError(message(caught));
            }
          } finally {
            if (active) {
              setIsLoading(false);
            }
          }
        }

        void loadCatalogue();
      },
      query.trim() ? 300 : 0,
    );

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [providerIds, query]);

  useEffect(() => {
    const controller = new AbortController();

    if (!savedIds.length) {
      return () => controller.abort();
    }

    async function loadSavedTitles() {
      try {
        const response = await requestJson<{ items: MediaTitle[] }>(
          `/api/catalog/items?ids=${encodeURIComponent(savedIds.join(","))}`,
          { signal: controller.signal },
        );

        setSavedTitles(response.items);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(message(caught));
        }
      }
    }

    void loadSavedTitles();

    return () => controller.abort();
  }, [savedIds]);

  const currentSavedTitles = useMemo(
    () => savedTitles.filter((item) => savedIds.includes(item.id)),
    [savedIds, savedTitles],
  );
  const titlesById = useMemo(
    () =>
      new Map(
        [...catalogue.sections.flatMap((section) => section.items), ...currentSavedTitles].map(
          (item) => [item.id, item],
        ),
      ),
    [catalogue, currentSavedTitles],
  );

  return {
    catalogue,
    providers,
    providerError,
    providerSources,
    providerStats,
    savedTitles: currentSavedTitles,
    titlesById,
    error,
    isLoading,
  };
}
