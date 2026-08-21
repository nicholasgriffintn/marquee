import { useEffect, useState } from "react";

import type { CatalogSection } from "../domain/catalog";
import { requestJson } from "../lib/api";

type RailsResponse = {
  sections: CatalogSection[];
  status: "ready" | "generating" | "error";
};

const RETRY_DELAYS = [4_000, 9_000];

export function useAiRails(isSignedIn: boolean, savedKey: string) {
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    let timer = 0;

    async function load(attempt: number) {
      try {
        const response = await requestJson<RailsResponse>(
          `/api/curator/rails${attempt === 0 ? "?generate=1" : ""}`,
          {
            signal: controller.signal,
          },
        );

        if (!active) {
          return;
        }

        setSections(response.sections);
        setIsGenerating(response.status === "generating");

        const delay = RETRY_DELAYS[attempt];

        if (response.status === "error") {
          return;
        }

        if (response.status === "generating" && delay !== undefined) {
          timer = window.setTimeout(() => void load(attempt + 1), delay);
        }
      } catch {
        if (active) {
          setIsGenerating(false);
        }
      }
    }

    void load(0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isSignedIn, savedKey]);

  return { sections, isGenerating };
}
