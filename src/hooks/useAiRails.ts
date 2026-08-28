import { useEffect, useRef, useState } from "react";

import type { CatalogSection } from "../domain/catalog";
import { queryJson } from "../lib/query-client";

type RailsResponse = {
  sections: CatalogSection[];
  status: "ready" | "generating" | "error";
};

const RETRY_DELAYS = [5_000, 10_000, 20_000, 30_000];
const SHELF_CHANGE_DEBOUNCE_MS = 4_000;

export function useAiRails(isSignedIn: boolean, savedKey: string) {
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settled, setSettled] = useState<{
    done: boolean;
    sections: CatalogSection[];
  }>({
    done: false,
    sections: [],
  });
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    let active = true;
    let timer = 0;
    const kickoffDelay = hasLoadedOnce.current ? SHELF_CHANGE_DEBOUNCE_MS : 0;

    hasLoadedOnce.current = true;

    async function load(attempt: number) {
      try {
        const response = await queryJson<RailsResponse>(
          `/api/curator/rails${attempt === 0 ? "?generate=1" : ""}`,
        );

        if (!active) {
          return;
        }

        setSections(response.sections);
        setIsGenerating(response.status === "generating");

        setSettled((current) =>
          current.done ? current : { done: true, sections: response.sections },
        );

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
          setSettled((current) => (current.done ? current : { done: true, sections: [] }));
        }
      }
    }

    const kickoff = window.setTimeout(() => void load(0), kickoffDelay);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearTimeout(timer);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- savedKey is a deliberate regenerate-on-shelf-change trigger, not read in the body
  }, [isSignedIn, savedKey]);

  return {
    sections,
    isGenerating,
    isResolved: !isSignedIn || settled.done,
    heroSections: settled.sections,
  };
}
