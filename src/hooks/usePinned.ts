import { useCallback, useState } from "react";

import type { CatalogSection } from "../domain/catalog";
import { jsonRequest, requestJson } from "../lib/api";
import { useResource } from "./useResource";

const NO_SECTIONS: CatalogSection[] = [];

export function usePinned(isSignedIn: boolean) {
  const [pinnedPrompt, setPinnedPrompt] = useState("");
  const { data, isLoading, reload } = useResource<{ sections: CatalogSection[] }>(
    "/api/curator/pinned",
    { enabled: isSignedIn },
  );

  const pin = useCallback(
    async (shelf: { name: string; prompt: string; reason: string; titleIds: string[] }) => {
      setPinnedPrompt(shelf.prompt);

      try {
        await requestJson("/api/curator/pinned", jsonRequest("POST", shelf));
        reload();

        return true;
      } catch {
        setPinnedPrompt("");

        return false;
      }
    },
    [reload],
  );

  const unpin = useCallback(
    async (sectionId: string) => {
      const id = sectionId.replace(/^pinned-/u, "");

      await requestJson(
        `/api/curator/pinned/${encodeURIComponent(id)}`,
        jsonRequest("DELETE"),
      ).catch(() => undefined);
      reload();
    },
    [reload],
  );

  return {
    sections: isSignedIn ? (data?.sections ?? NO_SECTIONS) : NO_SECTIONS,
    isResolved: !isSignedIn || !isLoading,
    pin,
    unpin,
    pinnedPrompt,
  };
}
