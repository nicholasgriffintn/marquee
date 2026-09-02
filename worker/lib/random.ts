export function shuffled<T>(items: readonly T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));

    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}
