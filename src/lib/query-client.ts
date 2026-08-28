import { QueryClient, queryOptions } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class QueryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QueryError";
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    const payload: unknown = await response.json().catch(() => null);

    if (isRecord(payload) && typeof payload.error === "string") {
      message = payload.error;
    }

    throw new QueryError(message, response.status);
  }

  return response.json();
}

export function jsonQueryOptions<T>(path: string, identity = "") {
  return queryOptions({
    queryKey: ["resource", path, identity],
    queryFn: () => fetchJson<T>(path),
  });
}

export function queryJson<T>(path: string) {
  return queryClient.fetchQuery(jsonQueryOptions<T>(path));
}

export function jsonMutation(method: "POST" | "PATCH" | "DELETE", body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function mutateJson<T = unknown>(path: string, init: RequestInit) {
  const mutation = queryClient.getMutationCache().build<T, Error, void, unknown>(queryClient, {
    mutationFn: () => fetchJson<T>(path, init),
  });

  return mutation.execute(undefined);
}

export function mutateResponse(path: string, init: RequestInit) {
  const mutation = queryClient
    .getMutationCache()
    .build<Response, Error, void, unknown>(queryClient, {
      mutationFn: () => fetch(path, init),
    });

  return mutation.execute(undefined);
}
