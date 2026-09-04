import { useCallback, useEffect, useRef, useState } from "react";

import type {
  RevivalBillResponse,
  RevivalBillSlot,
  RevivalCard,
  RevivalHubs,
  RevivalScreening,
  RevivalShelf,
  RevivalShelvesResponse,
} from "../domain/revival";
import { jsonMutation, mutateJson, queryJson } from "../lib/query-client";
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

export function useHubs(isReady: boolean) {
  const { data } = useResource<RevivalHubs>("/api/revival/hubs", { enabled: isReady });

  return data;
}

type ShelfPage = {
  id: string;
  label: string | null;
  works: RevivalCard[];
  page: number;
  total: number;
  hasMore: boolean;
};

export function useShelfPages(id: string | null, isReady: boolean) {
  const [paging, setPaging] = useState<{ id: string | null; earlier: RevivalCard[]; page: number }>(
    { id, earlier: [], page: 1 },
  );
  const page = paging.id === id ? paging.page : 1;
  const earlier = paging.id === id ? paging.earlier : NO_CARDS;
  const path = id && isReady ? `/api/revival/shelf/${encodeURIComponent(id)}?page=${page}` : null;
  const { data, isLoading, error } = useResource<ShelfPage>(path, {
    errorMessage: "That shelf is unavailable",
  });
  const current = data?.id === id && data.page === page ? data : null;
  const works = current ? [...earlier, ...current.works] : earlier;

  return {
    label: current?.label ?? null,
    works,
    total: current?.total ?? 0,
    hasMore: current?.hasMore ?? false,
    isLoading,
    error,
    loadMore: () => setPaging({ id, earlier: works, page: page + 1 }),
  };
}

export function useResumeShelf(isReady: boolean) {
  const { data } = useResource<{ works: RevivalCard[] }>("/api/revival/resume", {
    enabled: isReady,
  });

  return data?.works ?? NO_CARDS;
}

export function useScreening(workId: string | undefined) {
  const { data, error, status, isLoading } = useResource<RevivalScreening>(
    workId ? `/api/revival/${encodeURIComponent(workId)}` : null,
  );

  return {
    screening: data,
    isLoading,
    error: status === 403 ? error : error && "Nothing showing under that name",
    isGated: status === 403,
  };
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

    let active = true;
    const timer = window.setTimeout(() => {
      queryJson<{ works: RevivalCard[] }>(`/api/revival/search?q=${encodeURIComponent(trimmed)}`)
        .then((response) => {
          if (active) {
            setState({ query: trimmed, works: response.works });
          }

          return response;
        })
        .catch(() => undefined);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
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

      void mutateJson(
        `/api/revival/${encodeURIComponent(workId)}/progress`,
        jsonMutation("POST", { positionSeconds: Math.floor(positionSeconds), finished }),
      ).catch(() => undefined);
    },
    [canSave, workId],
  );
}
