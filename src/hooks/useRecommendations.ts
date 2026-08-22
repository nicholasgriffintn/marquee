import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

const NO_ITEMS: MediaTitle[] = [];

export function useRecommendations(titleId: string, ids: string[] | undefined, limit: number) {
  const [loaded, setLoaded] = useState<{ key: string; items: MediaTitle[] }>({
    key: "",
    items: NO_ITEMS,
  });
  const key = (ids ?? [])
    .filter((id) => id !== titleId)
    .slice(0, limit)
    .join(",");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      try {
        const response = await requestJson<{ items: MediaTitle[] }>(
          `/api/catalog/items?ids=${encodeURIComponent(key)}`,
          { signal: controller.signal },
        );

        if (active) {
          setLoaded({ key, items: response.items });
        }
      } catch {
        if (active) {
          setLoaded({ key, items: NO_ITEMS });
        }
      }
    }

    if (key) {
      void load();
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [key]);

  return loaded.key === key ? loaded.items : NO_ITEMS;
}
