import { useCallback } from "react";

import type { MediaTitle } from "../domain/catalog";
import { startJourney } from "../lib/journey";

type JourneyStart = { journey?: string; rank?: number; titleIds?: string[] };

export function useJourneyOpen(onOpen: (item: MediaTitle) => void, start: JourneyStart) {
  const { journey, rank, titleIds } = start;

  return useCallback(
    (item: MediaTitle) => {
      const inferredRank = rank ?? titleIds?.indexOf(item.id);

      startJourney(item.id, journey, inferredRank === -1 ? undefined : inferredRank);
      onOpen(item);
    },
    [journey, onOpen, rank, titleIds],
  );
}
