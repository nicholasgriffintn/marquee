import { useCallback, useEffect, useState } from "react";

import type { CatalogSection } from "../domain/catalog";
import { jsonRequest, requestJson } from "../lib/api";

type PinnedResponse = { sections: CatalogSection[] };

export function usePinned(isSignedIn: boolean) {
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [pinnedPrompt, setPinnedPrompt] = useState("");
  const [version, setVersion] = useState(0);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<PinnedResponse>("/api/curator/pinned", {
          signal: controller.signal,
        });

        setSections(response.sections);
        setIsResolved(true);
      } catch {
        setIsResolved(true);
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn, version]);

  const pin = useCallback(
    async (shelf: { name: string; prompt: string; reason: string; titleIds: string[] }) => {
      setPinnedPrompt(shelf.prompt);

      try {
        await requestJson("/api/curator/pinned", jsonRequest("POST", shelf));
        setVersion((current) => current + 1);

        return true;
      } catch {
        setPinnedPrompt("");

        return false;
      }
    },
    [],
  );

  const unpin = useCallback(async (sectionId: string) => {
    const id = sectionId.replace(/^pinned-/u, "");

    await requestJson(`/api/curator/pinned/${encodeURIComponent(id)}`, jsonRequest("DELETE")).catch(
      () => undefined,
    );
    setVersion((current) => current + 1);
  }, []);

  return {
    sections: isSignedIn ? sections : [],
    isResolved: !isSignedIn || isResolved,
    pin,
    unpin,
    pinnedPrompt,
  };
}
