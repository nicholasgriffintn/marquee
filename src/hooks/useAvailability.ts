import { useEffect, useState } from "react";

import type { MediaTitle, ProviderAvailability } from "../domain/catalog";
import { requestJson } from "../lib/api";

export type NextEpisode = {
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  airsAt: string;
  network: string | null;
};

type AvailabilityResponse = {
  providers: ProviderAvailability[];
  nextEpisode?: NextEpisode | null;
};

export function useAvailability(item: MediaTitle, enabled: boolean) {
  const [loaded, setLoaded] = useState<{
    titleId: string;
    providers: ProviderAvailability[];
    nextEpisode: NextEpisode | null;
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

        if (!response.providers.length && !response.nextEpisode) {
          return;
        }

        const fallbackById = new Map(item.providers.map((provider) => [provider.id, provider]));

        setLoaded({
          titleId: item.id,
          nextEpisode: response.nextEpisode ?? null,
          providers: response.providers.map((provider) => {
            const fallback = fallbackById.get(provider.id);

            return Object.assign({}, provider, {
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

  const live = enabled && loaded?.titleId === item.id ? loaded : null;

  return {
    providers: live && live.providers.length ? live.providers : item.providers,
    nextEpisode: live?.nextEpisode ?? null,
  };
}
