import { canonicalOrigin } from "./security.ts";
import { isRecord } from "./values.ts";

const MAX_JSON_BYTES = 24_000;

export function jsonResponse(payload: unknown, status = 200, extra?: Record<string, string>) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=UTF-8",
    ...extra,
  });

  return new Response(JSON.stringify(payload), { headers, status });
}

export async function readJsonObject(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return null;
  }

  try {
    const text = await request.text();

    if (text.length > MAX_JSON_BYTES) {
      return null;
    }

    const body: unknown = JSON.parse(text);

    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function hasTrustedOrigin(request: Request, configuredOrigin?: string) {
  const origin = request.headers.get("origin");

  return origin === canonicalOrigin(request, configuredOrigin);
}
