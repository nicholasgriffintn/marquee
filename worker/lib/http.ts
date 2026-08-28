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

export function withCookies(response: Response, ...cookies: (string | null | undefined)[]) {
  for (const cookie of cookies) {
    if (cookie) {
      response.headers.append("set-cookie", cookie);
    }
  }

  return response;
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

export function errorStatus(error: unknown) {
  if (error instanceof Error && "status" in error) {
    const status = (error as { status?: unknown }).status;

    return typeof status === "number" ? status : null;
  }

  return null;
}

export function isPermanentHttpStatus(status: number | null) {
  return status !== null && status >= 400 && status < 500 && status !== 429;
}
