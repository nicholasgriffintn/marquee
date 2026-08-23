type UpstreamRequest = {
  timeoutMs: number;
  headers?: Record<string, string>;
  cacheTtl?: number;
  method?: "GET" | "POST";
  body?: string;
};

export function upstreamFetch(url: string | URL, request: UpstreamRequest) {
  return fetch(url, {
    method: request.method,
    body: request.body,
    headers: { accept: "application/json", ...request.headers },
    signal: AbortSignal.timeout(request.timeoutMs),
    ...(request.cacheTtl
      ? { cf: { cacheEverything: true, cacheTtl: request.cacheTtl } }
      : undefined),
  });
}
