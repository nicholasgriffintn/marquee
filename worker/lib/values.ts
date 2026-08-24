export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function recordAt(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] : null;
}

export function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function stringAt(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : null;
}

export function boundedString(value: unknown, maximumLength = 2_048) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength
    ? value.trim()
    : null;
}

export function databaseDate(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function numberAt(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : null;
}

export function positiveNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export function calendarDate(value: unknown) {
  return typeof value === "string" && CALENDAR_DATE.test(value) ? value : null;
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function stringList(value: unknown, options: { limit?: number; itemLength?: number } = {}) {
  if (!Array.isArray(value)) {
    return [];
  }

  const strings = value.filter((entry): entry is string => typeof entry === "string");
  const itemLength = options.itemLength;
  const cleaned = itemLength
    ? strings.map((entry) => entry.trim().slice(0, itemLength)).filter(Boolean)
    : strings;

  return options.limit === undefined ? cleaned : cleaned.slice(0, options.limit);
}

export function jsonStringList(
  value: string | null | undefined,
  options: { limit?: number; itemLength?: number } = {},
) {
  return stringList(parseJson(value ?? ""), options);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

export function vectorValues(value: unknown): number[] | null {
  const values = Array.isArray(value)
    ? value
    : ArrayBuffer.isView(value) && !(value instanceof DataView)
      ? [...(value as Float32Array)]
      : null;

  return values && values.length > 0 && values.every((item) => Number.isFinite(item))
    ? (values as number[])
    : null;
}
