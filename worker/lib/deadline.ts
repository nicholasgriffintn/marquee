export function withDeadline<T>(promise: Promise<T>, milliseconds: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
