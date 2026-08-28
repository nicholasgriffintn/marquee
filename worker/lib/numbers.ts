export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function boundedInteger(
  value: string | number | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) ? clamp(Math.trunc(parsed), minimum, maximum) : fallback;
}
