import type { AuthUser } from "@ngriffin_uk/auth-core";

import { databaseDate } from "../lib/values.ts";

export interface MarqueeUser extends AuthUser {
  displayName: string;
  githubLogin: string;
  avatarUrl?: string;
}

export interface UserRow {
  id: string;
  name: string;
  github_login: string;
  avatar_url: string | null;
  created_at: string;
}

export function mapUser(row: UserRow): MarqueeUser {
  return {
    id: row.id,
    displayName: row.name,
    githubLogin: row.github_login,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    createdAt: databaseDate(row.created_at),
  };
}
