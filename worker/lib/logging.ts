export function logError(event: string, error: unknown, detail: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      event,
      ...detail,
      kind: error instanceof Error ? error.name : "UnknownError",
    }),
  );
}
