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

export async function readCappedArrayBuffer(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > maxBytes) {
    return null;
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      void reader.cancel();

      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body.buffer;
}
