import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import type { TitleShowings } from "../domain/cinema";
import { requestJson } from "../lib/api";

const EMPTY: TitleShowings = { listings: [], origin: null, radiusKm: 0, fetchedAt: "" };

/**
 * Only films play in cinemas, and only members get the local listings, so the
 * request is skipped entirely rather than fired and discarded.
 */
export function useShowings(item: MediaTitle, enabled: boolean) {
  const [showings, setShowings] = useState<TitleShowings & { titleId: string }>({
    ...EMPTY,
    titleId: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const active = enabled && item.mediaType === "movie";

  useEffect(() => {
    if (!active) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      setIsLoading(true);

      try {
        const response = await requestJson<TitleShowings>(
          `/api/cinema/titles/${item.mediaType}/${item.tmdbId}`,
          { signal: controller.signal },
        );

        setShowings({ ...response, titleId: item.id });
      } catch {
        setShowings({ ...EMPTY, titleId: item.id });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [active, item.id, item.mediaType, item.tmdbId]);

  const live = showings.titleId === item.id ? showings : EMPTY;

  return {
    listings: live.listings,
    origin: live.origin,
    isLoading: isLoading && live.listings.length === 0,
    isAvailable: active,
  };
}
