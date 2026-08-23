import { useMemo } from "react";

import type { CatalogResponse } from "../domain/catalog";
import { useProviders } from "./useProviders";
import { useResource } from "./useResource";

const EMPTY_CATALOGUE: CatalogResponse = {
  sections: [],
  source: "TMDB",
  availabilitySource: "JustWatch via TMDB",
  fetchedAt: "",
};

export function useCatalog(providerIds: string[], isReady: boolean) {
  const providerKey = providerIds.join(",");
  const providers = useProviders();
  const { data, error, isLoading } = useResource<CatalogResponse>(
    `/api/catalog${providerKey ? `?providers=${encodeURIComponent(providerKey)}` : ""}`,
    { enabled: isReady, errorMessage: "Live catalogue is unavailable" },
  );
  const catalogue = data ?? EMPTY_CATALOGUE;
  const titlesById = useMemo(
    () =>
      new Map(
        catalogue.sections.flatMap((section) => section.items).map((item) => [item.id, item]),
      ),
    [catalogue],
  );

  return {
    catalogue,
    providers: providers.providers,
    providerError: providers.error,
    providerSources: providers.sources,
    providerStats: providers.stats,
    titlesById,
    error,
    isLoading,
  };
}
