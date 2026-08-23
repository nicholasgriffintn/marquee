const YEAR_PATTERN = /(1[6-9]\d{2}|20\d{2})/u;
const IMDB_PATTERN = /\/(tt\d+)/u;

export function firstString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  return Array.isArray(value) && typeof value[0] === "string" ? value[0].trim() : "";
}

export function stripMarkup(value: string) {
  return value
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll(/&[a-z]+;/giu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

export function yearFrom(value: string) {
  const match = YEAR_PATTERN.exec(value);

  return match ? Number(match[1]) : null;
}

export function titleCase(value: string) {
  return value.replaceAll(/\b\w/gu, (character) => character.toUpperCase());
}

export function comparableTitle(value: string) {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function imdbIdFrom(url: string | null | undefined) {
  return url ? (IMDB_PATTERN.exec(url)?.[1] ?? null) : null;
}
