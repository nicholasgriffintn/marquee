const TRANSIENT =
  /internal error|failed to parse body as json|network connection lost|storage caused object to be reset|d1_error/iu;

export function isTransient(error: unknown) {
  return error instanceof Error && TRANSIENT.test(error.message);
}

export async function retryTransient<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      last = error;

      if (!isTransient(error)) {
        throw error;
      }
    }
  }

  throw last;
}
