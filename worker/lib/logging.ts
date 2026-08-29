export function errorMessage(error: unknown, limit = 300) {
  return (error instanceof Error ? error.message : String(error)).slice(0, limit);
}

export function logEvent(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...detail }));
}

export function logError(event: string, error: unknown, detail: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      event,
      ...detail,
      kind: error instanceof Error ? error.name : "UnknownError",
      detail: errorMessage(error),
    }),
  );
}

export function logRejection(
  task: Promise<unknown>,
  event: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  return task.then(
    () => undefined,
    (error: unknown) => {
      logError(event, error, detail);
    },
  );
}
