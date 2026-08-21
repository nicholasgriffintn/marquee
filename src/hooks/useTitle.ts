import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

export function useTitle(titleId: string | undefined, known: Map<string, MediaTitle>) {
  const [fetched, setFetched] = useState<MediaTitle | null>(null);
  const resolved = titleId ? (known.get(titleId) ?? null) : null;
  const needsFetch = Boolean(titleId) && !resolved && fetched?.id !== titleId;

  useEffect(() => {
    if (!needsFetch || !titleId) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<{ items: MediaTitle[] }>(
          `/api/catalog/items?ids=${encodeURIComponent(titleId as string)}`,
          { signal: controller.signal },
        );

        setFetched(response.items[0] ?? null);
      } catch {
        setFetched(null);
      }
    }

    void load();

    return () => controller.abort();
  }, [needsFetch, titleId]);

  if (!titleId) {
    return { title: null, isLoading: false };
  }

  const title = resolved ?? (fetched?.id === titleId ? fetched : null);

  return { title, isLoading: !title };
}
