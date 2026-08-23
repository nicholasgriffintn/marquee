import { useMemo } from "react";

import type { MediaTitle, ProviderAvailability } from "../domain/catalog";
import { useResource } from "./useResource";

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
  const { mediaType, tmdbId, providers: listed, watchLink } = item;
  const { data } = useResource<AvailabilityResponse>(
    `/api/catalog/${mediaType}/${tmdbId}/availability`,
    { enabled },
  );
  const live = data?.providers.length || data?.nextEpisode ? data : null;
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
