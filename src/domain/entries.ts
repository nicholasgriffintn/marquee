export const ENTRY_STATUSES = ["watchlist", "watching", "watched", "dropped"] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

const KNOWN: ReadonlySet<string> = new Set(ENTRY_STATUSES);

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === "string" && KNOWN.has(value);
}
