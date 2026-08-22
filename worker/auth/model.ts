import type { AuthUser } from "@ngriffin_uk/auth-core";

import { databaseDate } from "../lib/values.ts";

export type UserRole = "viewer" | "admin";

export interface MarqueeUser extends AuthUser {
  displayName: string;
  githubLogin: string;
  avatarUrl?: string;
  role: UserRole;
}

export interface UserRow {
  id: string;
  name: string;
  github_login: string;
  avatar_url: string | null;
  role: string | null;
  created_at: string;
}

export function mapUser(row: UserRow): MarqueeUser {
  return {
    id: row.id,
    displayName: row.name,
    githubLogin: row.github_login,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    role: row.role === "admin" ? "admin" : "viewer",
    createdAt: databaseDate(row.created_at),
  };
}
