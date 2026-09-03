const TRANSIENT =
  /internal error|failed to parse body as json|network connection lost|storage caused object to be reset|connection (?:reset|terminated unexpectedly)|server closed the connection unexpectedly|deadlock detected|remaining connection slots are reserved|too many connections/iu;

const BACKOFF_STEP_MS = 100;
const BACKOFF_JITTER_MS = 50;

function isTransient(error: unknown) {
  return error instanceof Error && TRANSIENT.test(error.message);
}

function backoff(attempt: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, BACKOFF_STEP_MS * attempt + Math.random() * BACKOFF_JITTER_MS),
  );
}

export async function retryTransient<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      last = error;

      if (!isTransient(error)) {
        throw error;
      }
    }

    if (attempt < attempts) {
      // oxlint-disable-next-line no-await-in-loop
      await backoff(attempt);
    }
  }

  throw last;
}
