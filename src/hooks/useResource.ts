import { useCallback, useEffect, useState } from "react";

import { ApiError, isAbortError, requestJson } from "../lib/api";

type ResourceOptions = {
  enabled?: boolean;
  debounceMs?: number;
  errorMessage?: string;
  refreshKey?: string;
};

type Loaded<T> = { path: string; data: T | null; error: string };

type Resource<T> = {
  data: T | null;
  error: string;
  isLoading: boolean;
  reload: () => void;
};

const NOTHING: Loaded<never> = { path: "", data: null, error: "" };

export function useResource<T>(path: string | null, options: ResourceOptions = {}): Resource<T> {
  const { enabled = true, debounceMs = 0, errorMessage = "", refreshKey = "" } = options;
  const active = enabled && Boolean(path);
  const identity = `${refreshKey}\u0000${path ?? ""}`;
  const [loaded, setLoaded] = useState<Loaded<T>>(NOTHING);
  const [isFetching, setIsFetching] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!active || !path) {
      return undefined;
    }

    const controller = new AbortController();
    let live = true;

    const load = () => {
      setIsFetching(true);
      requestJson<T>(path, { signal: controller.signal })
        .then((data) => {
          if (live) {
            setLoaded({ path: identity, data, error: "" });
          }

          return data;
        })
        .catch((caught: unknown) => {
          if (!live || isAbortError(caught)) {
            return;
          }

          setLoaded({
            path: identity,
            data: null,
            error: errorMessage || (caught instanceof ApiError ? caught.message : "Request failed"),
          });
        })
        .finally(() => {
          if (live) {
            setIsFetching(false);
          }
        });
    };

    const timer = debounceMs > 0 ? window.setTimeout(load, debounceMs) : 0;

    if (!timer) {
      load();
    }

    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, debounceMs, errorMessage, identity, path, version]);

  const settled = loaded.path === identity;

  return {
    data: settled ? loaded.data : null,
    error: settled ? loaded.error : "",
    isLoading: active && (isFetching || !settled),
    reload: useCallback(() => setVersion((current) => current + 1), []),
  };
}
