export function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDatabaseDate(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return value;
  }

  if (!value) {
    return null;
  }

  const timestamp = (value.includes("T") ? value : value.replace(" ", "T")).replace(
    /([+-]\d{2})$/u,
    "$1:00",
  );
  const timezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/u;

  return parseDate(timezone.test(timestamp) ? timestamp : `${timestamp}Z`);
}

export function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = "",
) {
  return parseDate(value)?.toLocaleDateString(undefined, options) ?? fallback;
}

export function formatDateTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = "",
) {
  return parseDate(value)?.toLocaleString(undefined, options) ?? fallback;
}

export function formatTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = "",
) {
  return parseDate(value)?.toLocaleTimeString(undefined, options) ?? fallback;
}
