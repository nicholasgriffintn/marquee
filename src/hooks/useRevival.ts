import { useCallback, useEffect, useRef, useState } from "react";

import type { RevivalProgramme, RevivalScreening, RevivalWork } from "../domain/revival";
import { jsonRequest, requestJson } from "../lib/api";

const EMPTY: RevivalProgramme = { shelves: [], total: 0, fetchedAt: "" };

type ProgrammeState = { programme: RevivalProgramme; isLoading: boolean; error: string };

const IDLE: ProgrammeState = { programme: EMPTY, isLoading: true, error: "" };

export function useProgramme(isReady: boolean) {
  const [state, setState] = useState<ProgrammeState>(IDLE);

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }

    const controller = new AbortController();

    requestJson<RevivalProgramme>("/api/revival", { signal: controller.signal })
      .then((programme) => setState({ programme, isLoading: false, error: "" }))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            programme: EMPTY,
            isLoading: false,
            error: cause instanceof Error ? cause.message : "The programme is unavailable",
          });
        }
      });

    return () => controller.abort();
  }, [isReady]);

  return state;
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
