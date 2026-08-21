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

export function useCatalog(providerIds: string[], savedIds: string[], isReady: boolean) {
  const [catalogue, setCatalogue] = useState<CatalogResponse>(emptyCatalogue);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSources, setProviderSources] = useState<string[]>([]);
  const [providerStats, setProviderStats] = useState(emptyProviderStats);
  const [savedTitles, setSavedTitles] = useState<MediaTitle[]>([]);
  const [error, setError] = useState("");
  const [providerError, setProviderError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const providerKey = providerIds.join(",");
  const savedKey = savedIds.join(",");

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
    if (!isReady) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      async function loadCatalogue() {
        setIsLoading(true);
        const parameters = new URLSearchParams();

        if (providerKey) {
          parameters.set("providers", providerKey);
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
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isReady, providerKey]);

  useEffect(() => {
    const controller = new AbortController();

    if (!savedKey) {
      return () => controller.abort();
    }

    async function loadSavedTitles() {
      try {
        const response = await requestJson<{ items: MediaTitle[] }>(
          `/api/catalog/items?ids=${encodeURIComponent(savedKey)}`,
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
  }, [savedKey]);

  const currentSavedTitles = useMemo(
    () => savedTitles.filter((item) => savedKey.split(",").includes(item.id)),
    [savedKey, savedTitles],
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
