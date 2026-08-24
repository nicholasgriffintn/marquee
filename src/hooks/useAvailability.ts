import { useEffect, useMemo, useRef, useState } from "react";

import type { MediaTitle, ProviderAvailability } from "../domain/catalog";
import { jsonRequest, requestJson } from "../lib/api";
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
  checked?: boolean;
};

export function useAvailability(item: MediaTitle, enabled: boolean) {
  const { id, mediaType, tmdbId, providers: listed, watchLink } = item;
  const { data } = useResource<AvailabilityResponse>(
    `/api/catalog/${mediaType}/${tmdbId}/availability`,
    { enabled },
  );
  const [refreshed, setRefreshed] = useState<AvailabilityResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [trackedId, setTrackedId] = useState(id);
  const attempted = useRef<string | null>(null);

  if (trackedId !== id) {
    setTrackedId(id);
    setRefreshed(null);
  }

  useEffect(() => {
    if (!enabled || !data || data.checked || attempted.current === id) {
      return;
    }

    attempted.current = id;
    setIsRefreshing(true);

    requestJson<AvailabilityResponse>(
      `/api/catalog/${mediaType}/${tmdbId}/availability/refresh`,
      jsonRequest("POST"),
    )
      .then((response) => setRefreshed(response))
      .catch(() => {})
      .finally(() => setIsRefreshing(false));
  }, [data, enabled, id, mediaType, tmdbId]);

  const live = refreshed ?? data;
  const hasLiveData = Boolean(live?.providers.length || live?.nextEpisode);
  const providers = useMemo(() => {
    if (!hasLiveData) {
      return listed;
    }

    const fallbackById = new Map(listed.map((provider) => [provider.id, provider]));

    return (live?.providers ?? []).map((provider) => ({
      ...provider,
      webUrl: provider.webUrl ?? fallbackById.get(provider.id)?.webUrl ?? watchLink,
    }));
  }, [hasLiveData, listed, live, watchLink]);

  return {
    providers,
    nextEpisode: (hasLiveData ? live?.nextEpisode : null) ?? null,
    isRefreshing: isRefreshing && providers.length === 0,
  };
}
