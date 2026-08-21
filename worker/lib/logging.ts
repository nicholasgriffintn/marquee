export function logError(event: string, error: unknown, detail: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      event,
      ...detail,
      kind: error instanceof Error ? error.name : "UnknownError",
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
  );
}
