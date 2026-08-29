import {
  type ApiScope,
  isFullAccess,
  parseScopes,
  serialiseScopes,
} from "../../src/domain/scopes.ts";
import { randomHex } from "../lib/tokens.ts";
import { hashState } from "../repositories/links.ts";
import type { Bindings } from "../types.ts";
import type { MarqueeUser } from "./model.ts";

const TOKEN_PREFIX = "mq_";

export function mintToken() {
  return `${TOKEN_PREFIX}${randomHex()}`;
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  return token.startsWith(TOKEN_PREFIX) && token.length <= 200 ? token : null;
}

export function hasBearerCredential(request: Request) {
  return /^mq_[0-9a-f]{64}$/u.test(bearerToken(request) ?? "");
}

export async function storeApiToken(
  env: Bindings,
  userId: string,
  token: string,
  label: string,
  scopes: readonly ApiScope[],
) {
  await env.DB.prepare(
    `INSERT INTO api_tokens (token_hash, user_id, label, scopes) VALUES (?, ?, ?, ?)`,
  )
    .bind(await hashState(token), userId, label.slice(0, 60) || "Untitled", serialiseScopes(scopes))
    .run();
}

export async function listApiTokens(env: Bindings, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT substr(token_hash, 1, 8) AS id, label, scopes, created_at AS createdAt,
            last_used_at AS lastUsedAt
     FROM api_tokens
     WHERE user_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<{
      id: string;
      label: string;
      scopes: string;
      createdAt: string;
      lastUsedAt: string | null;
    }>();

  return rows.results.map((row) => {
    const scopes = parseScopes(row.scopes);

    return {
      id: row.id,
      label: row.label,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      scopes,
      fullAccess: isFullAccess(scopes),
    };
  });
}

export async function revokeApiToken(env: Bindings, userId: string, id: string) {
  const result = await env.DB.prepare(
    `DELETE FROM api_tokens WHERE user_id = ? AND substr(token_hash, 1, 8) = ?`,
  )
    .bind(userId, id)
    .run();

  return result.meta.changes > 0;
}

export type BearerIdentity = { user: MarqueeUser; scopes: ApiScope[] };

export async function bearerIdentity(
  env: Bindings,
  request: Request,
): Promise<BearerIdentity | null> {
  const token = bearerToken(request) ?? "";

  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) {
    return null;
  }

  const tokenHash = await hashState(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.github_login AS githubLogin, u.email, u.avatar_url AS avatarUrl,
            u.role, t.scopes
     FROM api_tokens AS t
     JOIN users AS u ON u.id = t.user_id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      id: string;
      name: string;
      githubLogin: string;
      email?: string | null;
      avatarUrl: string | null;
      role: string | null;
      scopes: string;
    }>();

  if (!row) {
    return null;
  }

  await env.DB.prepare(
    `UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .run();

  return {
    user: {
      id: row.id,
      displayName: row.name,
      githubLogin: row.githubLogin,
      email: row.email ?? "",
      ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
      role: row.role === "admin" ? "admin" : "viewer",
      createdAt: new Date(),
    },
    scopes: parseScopes(row.scopes),
  };
}

export async function revokeBearerToken(env: Bindings, request: Request) {
  const token = bearerToken(request);

  if (!token) {
    return false;
  }

  const result = await env.DB.prepare(`DELETE FROM api_tokens WHERE token_hash = ?`)
    .bind(await hashState(token))
    .run();

  return result.meta.changes > 0;
}
