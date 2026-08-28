export function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDatabaseDate(value: string | null | undefined) {
  return parseDate(value && !value.includes("T") ? `${value.replace(" ", "T")}Z` : value);
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
