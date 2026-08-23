function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const payload: unknown = await response.json();

      if (isRecord(payload) && typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Preserve the status-based message when an intermediary returns non-JSON.
    }

    throw new ApiError(message, response.status);
  }

  return response.json();
}

export function jsonRequest(method: "POST" | "PATCH" | "DELETE", body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
