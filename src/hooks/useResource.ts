import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { jsonQueryOptions, QueryError } from "../lib/query-client";

type ResourceOptions = {
  enabled?: boolean;
  errorMessage?: string;
  refreshKey?: string;
  staleTime?: number;
};

type Resource<T> = {
  data: T | null;
  error: string;
  isLoading: boolean;
  isRefreshing: boolean;
  reload: () => void;
};

export function useResource<T>(path: string | null, options: ResourceOptions = {}): Resource<T> {
  const { enabled = true, errorMessage = "", refreshKey = "", staleTime } = options;
  const active = enabled && Boolean(path);
  const loadPath = path ?? "";
  const { data, error, isFetching, isPending, refetch } = useQuery({
    ...jsonQueryOptions<T>(loadPath, refreshKey),
    enabled: active,
    ...(staleTime === undefined ? {} : { staleTime }),
  });
  const reload = useCallback(() => {
    if (active) {
      void refetch();
    }
  }, [active, refetch]);

  return {
    data: data ?? null,
    error: error
      ? errorMessage || (error instanceof QueryError ? error.message : "Request failed")
      : "",
    isLoading: active && isPending,
    isRefreshing: active && isFetching,
    reload,
  };
}
