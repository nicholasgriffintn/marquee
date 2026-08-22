import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

export function useTrending(isReady: boolean) {
  const [items, setItems] = useState<MediaTitle[]>([]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const controller = new AbortController();

    requestJson<{ items: MediaTitle[] }>("/api/catalog/trending", { signal: controller.signal })
      .then((response) => setItems(response.items))
      .catch(() => setItems([]));

    return () => controller.abort();
  }, [isReady]);

  return items;
}
