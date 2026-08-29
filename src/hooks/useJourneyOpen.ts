import { useCallback } from "react";

import type { MediaTitle } from "../domain/catalog";
import { startJourney, type JourneyStart } from "../lib/journey";

export function useJourneyOpen(onOpen: (item: MediaTitle) => void, start: JourneyStart) {
  const { source, decisionId, position } = start;

  return useCallback(
    (item: MediaTitle) => {
      startJourney(item.id, {
        source,
        ...(position === undefined ? {} : { position }),
        ...(decisionId ? { decisionId } : {}),
      });
      onOpen(item);
    },
    [decisionId, onOpen, position, source],
  );
}
