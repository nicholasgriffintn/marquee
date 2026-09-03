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

const DAY_MS = 86_400_000;

export function formatDaysAgo(value: string | null | undefined, fallback = "") {
  const parsed = parseDate(value);

  if (!parsed) {
    return fallback;
  }

  const days = Math.floor((Date.now() - parsed.getTime()) / DAY_MS);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 14) {
    return `${days} days ago`;
  }

  if (days < 60) {
    return `${Math.floor(days / 7)} weeks ago`;
  }

  return formatDate(value, { day: "numeric", month: "short" }, fallback);
}

const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/u;

function localeDayFirst() {
  const parts = new Intl.DateTimeFormat().formatToParts(new Date(Date.UTC(2000, 0, 2)));

  return parts.find((part) => part.type === "day" || part.type === "month")?.type === "day";
}

export function parseSlashDate(value: string, dayFirst: boolean) {
  const match = SLASH_DATE.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, first = "", second = "", rawYear = ""] = match;
  const day = Number(dayFirst ? first : second);
  const month = Number(dayFirst ? second : first);
  const shortYear = Number(rawYear);
  const year = rawYear.length === 2 ? (shortYear >= 70 ? 1900 : 2000) + shortYear : shortYear;
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
}

export function slashDatesAreDayFirst(values: Iterable<string>) {
  for (const value of values) {
    const match = SLASH_DATE.exec(value.trim());
    const first = Number(match?.[1]);
    const second = Number(match?.[2]);

    if (!match || first === second) {
      continue;
    }

    if (first > 12 && second <= 12) {
      return true;
    }

    if (second > 12 && first <= 12) {
      return false;
    }
  }

  return localeDayFirst();
}
