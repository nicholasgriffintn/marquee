import { useCallback, useEffect, useRef, useState } from "react";

import type {
  RevivalBillResponse,
  RevivalBillSlot,
  RevivalCard,
  RevivalScreening,
  RevivalShelf,
  RevivalShelvesResponse,
  RevivalWork,
} from "../domain/revival";
import { jsonRequest, requestJson } from "../lib/api";
import { useResource } from "./useResource";

const NO_BILL: RevivalBillSlot[] = [];
const NO_SHELVES: RevivalShelf[] = [];
const NO_CARDS: RevivalCard[] = [];

export function useVaultTotal(isReady: boolean) {
  const { data } = useResource<{ total: number }>("/api/revival/vault", { enabled: isReady });

  return data?.total ?? 0;
}

export function useBill(isReady: boolean) {
  const { data, error, isLoading } = useResource<RevivalBillResponse>("/api/revival/bill", {
    enabled: isReady,
    errorMessage: "Tonight's bill is unavailable",
  });

  return { bill: data?.bill ?? NO_BILL, error, isLoading: isLoading || !isReady };
}

export function useShelves(isReady: boolean) {
  const { data, error, isLoading } = useResource<RevivalShelvesResponse>("/api/revival/shelves", {
    enabled: isReady,
    errorMessage: "The programme is unavailable",
  });

  return { shelves: data?.shelves ?? NO_SHELVES, error, isLoading: isLoading || !isReady };
}

export function useResumeShelf(isReady: boolean) {
  const { data } = useResource<{ works: RevivalCard[] }>("/api/revival/resume", {
    enabled: isReady,
  });

  return data?.works ?? NO_CARDS;
}

type ScreeningState = { workId: string; screening: RevivalScreening | null; error: string };

export function useScreening(workId: string | undefined) {
  const [state, setState] = useState<ScreeningState>({ workId: "", screening: null, error: "" });

  useEffect(() => {
    if (!workId) {
      return undefined;
    }

    const controller = new AbortController();

    requestJson<RevivalScreening>(`/api/revival/${encodeURIComponent(workId)}`, {
      signal: controller.signal,
    })
      .then((screening) => setState({ workId, screening, error: "" }))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            workId,
            screening: null,
            error: cause instanceof Error ? cause.message : "Nothing showing under that name",
          });
        }
      });

    return () => controller.abort();
  }, [workId]);

  const settled = state.workId === workId;

  return {
    screening: settled ? state.screening : null,
    isLoading: Boolean(workId) && !settled,
    error: settled ? state.error : "",
  };
}

export function useTitleReels(titleId: string, mediaType: string, tmdbId: number) {
  const [works, setWorks] = useState<RevivalWork[]>([]);

  useEffect(() => {
    if (!titleId) {
      return undefined;
    }

    const controller = new AbortController();

    requestJson<{ works: RevivalWork[] }>(`/api/revival/titles/${mediaType}/${tmdbId}`, {
      signal: controller.signal,
    })
      .then((response) => setWorks(response.works))
      .catch(() => setWorks([]));

    return () => controller.abort();
  }, [mediaType, titleId, tmdbId]);

  return works;
}

const SEARCH_DEBOUNCE_MS = 250;

export function useVaultSearch(query: string) {
  const [state, setState] = useState<{ query: string; works: RevivalCard[] }>({
    query: "",
    works: [],
  });
  const trimmed = query.trim();
  const isActive = trimmed.length >= 2;

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      requestJson<{ works: RevivalCard[] }>(
        `/api/revival/search?q=${encodeURIComponent(trimmed)}`,
        {
          signal: controller.signal,
        },
      )
        .then((response) => setState({ query: trimmed, works: response.works }))
        .catch(() => undefined);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isActive, trimmed]);

  const settled = state.query === trimmed;

  return {
    works: settled ? state.works : [],
    isSearching: isActive && !settled,
    isActive,
  };
}

const PROGRESS_INTERVAL_SECONDS = 20;

export function useProgressReporter(workId: string, canSave: boolean) {
  const lastSent = useRef(0);

  return useCallback(
    (positionSeconds: number, finished: boolean) => {
      if (!canSave || !workId) {
        return;
      }

      if (!finished && Math.abs(positionSeconds - lastSent.current) < PROGRESS_INTERVAL_SECONDS) {
        return;
      }

      lastSent.current = positionSeconds;

      void fetch(
        `/api/revival/${encodeURIComponent(workId)}/progress`,
        jsonRequest("POST", { positionSeconds: Math.floor(positionSeconds), finished }),
      ).catch(() => undefined);
    },
    [canSave, workId],
  );
}
