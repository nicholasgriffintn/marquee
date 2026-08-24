type UpstreamRequest = {
  timeoutMs: number;
  headers?: Record<string, string>;
  cacheTtl?: number;
  method?: "GET" | "POST" | "HEAD";
  body?: string;
};

export const UPSTREAM_AGENT =
  "Marquee/1.0 (personal streaming discovery; https://marquee.pashi.app)";

export function upstreamFetch(url: string | URL, request: UpstreamRequest) {
  return fetch(url, {
    method: request.method,
    body: request.body,
    headers: {
      accept: "application/json",
      "user-agent": UPSTREAM_AGENT,
      ...request.headers,
    },
    signal: AbortSignal.timeout(request.timeoutMs),
    ...(request.cacheTtl
      ? { cf: { cacheEverything: true, cacheTtl: request.cacheTtl } }
      : undefined),
  });
}
