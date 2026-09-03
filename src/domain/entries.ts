export const ENTRY_STATUSES = ["watchlist", "watching", "watched", "dropped"] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  watchlist: "On my watchlist",
  watching: "Watching",
  watched: "Watched",
  dropped: "Dropped",
};

const KNOWN: ReadonlySet<string> = new Set(ENTRY_STATUSES);

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === "string" && KNOWN.has(value);
}
