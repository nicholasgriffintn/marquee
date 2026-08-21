import { useEffect, useState } from "react";

import type { MediaTitle, ProviderAvailability } from "../domain/catalog";
import { requestJson } from "../lib/api";

type AvailabilityResponse = {
  providers: ProviderAvailability[];
};

export function useAvailability(item: MediaTitle, enabled: boolean) {
  const [loaded, setLoaded] = useState<{
    titleId: string;
    providers: ProviderAvailability[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (!enabled) {
      return () => controller.abort();
    }

    async function load() {
      try {
        const response = await requestJson<AvailabilityResponse>(
          `/api/catalog/${item.mediaType}/${item.tmdbId}/availability`,
          { signal: controller.signal },
        );

        if (!response.providers.length) {
          return;
        }

        const fallbackById = new Map(item.providers.map((provider) => [provider.id, provider]));

        setLoaded({
          titleId: item.id,
          providers: response.providers.map((provider) => {
            const fallback = fallbackById.get(provider.id);

            return Object.assign({}, provider, {
              logoUrl: provider.logoUrl ?? fallback?.logoUrl ?? null,
              webUrl: provider.webUrl ?? fallback?.webUrl ?? item.watchLink,
            });
          }),
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [enabled, item]);

  return enabled && loaded?.titleId === item.id ? loaded.providers : item.providers;
}
