import type { EntryStatus } from "./domain/entries";

export { isEntryStatus } from "./domain/entries";
export type { EntryStatus };

export type UserRole = "viewer" | "admin";

export type User = {
  id: string;
  name: string;
  login: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type ViewingEntry = {
  id?: string;
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
  season?: number | null;
  episode?: number | null;
  updatedAt?: string;
};
