export type User = {
  id: string;
  name: string;
  login: string;
  avatarUrl: string | null;
};

export type EntryStatus = "watchlist" | "watching" | "watched" | "dropped";

export function isEntryStatus(value: string): value is EntryStatus {
  return (
    value === "watchlist" || value === "watching" || value === "watched" || value === "dropped"
  );
}

export type ViewingEntry = {
  id?: string;
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
  updatedAt?: string;
};
