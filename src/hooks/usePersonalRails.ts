import { useEffect, useState } from "react";

import type { CatalogSection } from "../domain/catalog";
import { requestJson } from "../lib/api";

type RailsResponse = { sections: CatalogSection[] };

const NO_SECTIONS: CatalogSection[] = [];

export function usePersonalRails(isSignedIn: boolean, savedKey: string) {
  const [loaded, setLoaded] = useState<{ key: string; sections: CatalogSection[] } | null>(null);
  const key = `${isSignedIn ? "in" : "out"}:${savedKey}`;
  const live = loaded?.key === key ? loaded : null;

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<RailsResponse>("/api/catalog/rails", {
          signal: controller.signal,
        });

        setLoaded({ key, sections: response.sections });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoaded({ key, sections: NO_SECTIONS });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn, key]);

  return {
    sections: live?.sections ?? NO_SECTIONS,
    isResolved: !isSignedIn || live !== null,
  };
}
