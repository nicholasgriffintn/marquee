import { useEffect, useMemo, useState } from "react";

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
  const { id, mediaType, tmdbId, providers: listed, watchLink } = item;

  useEffect(() => {
    const controller = new AbortController();

    if (!enabled) {
      return () => controller.abort();
    }

    async function load() {
      try {
        const response = await requestJson<AvailabilityResponse>(
          `/api/catalog/${mediaType}/${tmdbId}/availability`,
          { signal: controller.signal },
        );

        if (!response.providers.length && !response.nextEpisode) {
          return;
        }

        setLoaded({
          titleId: id,
          nextEpisode: response.nextEpisode ?? null,
          providers: response.providers,
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [enabled, id, mediaType, tmdbId]);

  const live = enabled && loaded?.titleId === id ? loaded : null;
  const providers = useMemo(() => {
    if (!live?.providers.length) {
      return listed;
    }

    const fallbackById = new Map(listed.map((provider) => [provider.id, provider]));

    return live.providers.map((provider) => ({
      ...provider,
      webUrl: provider.webUrl ?? fallbackById.get(provider.id)?.webUrl ?? watchLink,
    }));
  }, [listed, live, watchLink]);

  return { providers, nextEpisode: live?.nextEpisode ?? null };
}
