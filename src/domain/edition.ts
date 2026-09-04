import type { MediaTitle } from "./catalog";

const DAY_MS = 86_400_000;
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export type EditionNumbers = { arrivals: number; catalogue: number; prints: number };

export type EditionArrivals<T> = { provider: { id: string; name: string }; items: T[] };

export type EditionReturning<T> = {
  item: T | null;
  showName: string;
  season: number | null;
  airsAt: string;
};

export type EditionIssue = {
  weekOf: string;
  printedAt: string;
  numbers: EditionNumbers;
  arrivals: EditionArrivals<MediaTitle>[];
  returning: EditionReturning<MediaTitle>[];
  trending: MediaTitle[];
  issues: string[];
};

export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftDays(weekOf: string, days: number) {
  return isoDay(new Date(Date.parse(`${weekOf}T00:00:00Z`) + days * DAY_MS));
}

export function currentWeekOf(now = new Date()) {
  const day = now.getUTCDay();
  const sinceMonday = (day + 6) % 7;

  return shiftDays(isoDay(now), -sinceMonday);
}

export function isWeekOf(value: unknown): value is string {
  if (typeof value !== "string" || !WEEK_PATTERN.test(value)) {
    return false;
  }

  const parsed = Date.parse(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).getUTCDay() === 1 &&
    isoDay(new Date(parsed)) === value
  );
}

export function editionPath(weekOf: string) {
  return `/this-week/${weekOf}`;
}
