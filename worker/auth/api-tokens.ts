import { hashState } from "../repositories/links.ts";
import type { Bindings } from "../types.ts";
import type { MarqueeUser } from "./model.ts";

const TOKEN_PREFIX = "mq_";

export function mintToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return `${TOKEN_PREFIX}${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function storeApiToken(env: Bindings, userId: string, token: string, label: string) {
  await env.DB.prepare(`INSERT INTO api_tokens (token_hash, user_id, label) VALUES (?, ?, ?)`)
    .bind(await hashState(token), userId, label.slice(0, 60) || "Untitled")
    .run();
}

export async function listApiTokens(env: Bindings, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT substr(token_hash, 1, 8) AS id, label, created_at AS createdAt, last_used_at AS lastUsedAt
     FROM api_tokens
     WHERE user_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<{ id: string; label: string; createdAt: string; lastUsedAt: string | null }>();

  return rows.results;
}

export async function revokeApiToken(env: Bindings, userId: string, id: string) {
  const result = await env.DB.prepare(
    `DELETE FROM api_tokens WHERE user_id = ? AND substr(token_hash, 1, 8) = ?`,
  )
    .bind(userId, id)
    .run();

  return result.meta.changes > 0;
}

export async function bearerUser(env: Bindings, request: Request): Promise<MarqueeUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) {
    return null;
  }

  const tokenHash = await hashState(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.github_login AS githubLogin, u.avatar_url AS avatarUrl
     FROM api_tokens AS t
     JOIN users AS u ON u.id = t.user_id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ id: string; name: string; githubLogin: string; avatarUrl: string | null }>();

  if (!row) {
    return null;
  }

  await env.DB.prepare(
    `UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .run();

  return {
    id: row.id,
    displayName: row.name,
    githubLogin: row.githubLogin,
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    createdAt: new Date(),
  };
}
