import {
  AuthError,
  createAuth,
  type AuthChallengeRecord,
  type AuthSessionRecord,
  type ChallengeStore,
  type ExternalIdentity,
  type IdentityStore,
  type SessionStore,
  type UserStore,
} from "@ngriffin_uk/auth-core";
import type { OAuthStateRecord, OAuthStateStore } from "@ngriffin_uk/auth-oauth2";

import { boundedString, parseJson } from "../lib/values.ts";
import { mapUser, type MarqueeUser, type UserRow } from "./model.ts";

export function createD1Auth(db: D1Database) {
  return createAuth({
    users: createUserStore(db),
    sessions: createSessionStore(db),
    identities: createIdentityStore(db),
    challenges: createD1ChallengeStore(db),
  });
}

export function createD1ChallengeStore(db: D1Database): ChallengeStore {
  return {
    async create(challenge) {
      await db
        .prepare(
          `INSERT INTO auth_challenges
             (token_hash, provider, kind, payload, attempts, created_at, expires_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(
          challenge.tokenHash,
          challenge.provider,
          challenge.kind,
          JSON.stringify(challenge.payload),
          challenge.attempts,
          challenge.createdAt.toISOString(),
          challenge.expiresAt.toISOString(),
        )
        .run();
    },
    async findByTokenHash(tokenHash) {
      const row = await db
        .prepare(`SELECT * FROM auth_challenges WHERE token_hash = ?1`)
        .bind(tokenHash)
        .first<ChallengeRow>();

      return row ? mapChallenge(row) : null;
    },
    async consumeByTokenHash(tokenHash) {
      const row = await db
        .prepare(`DELETE FROM auth_challenges WHERE token_hash = ?1 RETURNING *`)
        .bind(tokenHash)
        .first<ChallengeRow>();

      return row ? mapChallenge(row) : null;
    },
    async incrementAttempts(tokenHash, expectedAttempts) {
      const result = await db
        .prepare(
          `UPDATE auth_challenges SET attempts = attempts + 1
           WHERE token_hash = ?1 AND attempts = ?2`,
        )
        .bind(tokenHash, expectedAttempts)
        .run();

      return (result.meta.changes ?? 0) > 0;
    },
  };
}

type ChallengeRow = {
  token_hash: string;
  provider: string;
  kind: string;
  payload: string;
  attempts: number;
  created_at: string;
  expires_at: string;
};

function mapChallenge(row: ChallengeRow): AuthChallengeRecord {
  const payload = parseJson(row.payload);

  return {
    tokenHash: row.token_hash,
    provider: row.provider,
    kind: row.kind as AuthChallengeRecord["kind"],
    payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
    attempts: row.attempts,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
  };
}

export async function findOrCreateByEmail(db: D1Database, email: string) {
  const existing = await db
    .prepare("SELECT * FROM users WHERE email = ?1")
    .bind(email)
    .first<UserRow>();

  if (existing) {
    return mapUser(existing);
  }

  const id = crypto.randomUUID();
  const name = email.split("@")[0]?.slice(0, 60) || "Guest";

  await db
    .prepare(
      `INSERT INTO users (id, name, github_login, avatar_url, email)
       VALUES (?1, ?2, '', NULL, ?3)`,
    )
    .bind(id, name, email)
    .run();

  const created = await db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();

  return created ? mapUser(created) : null;
}

export function createD1OAuthStateStore(db: D1Database): OAuthStateStore {
  return {
    create: (state) => storeOAuthState(db, state),
    consumeByStateHash: (stateHash) => consumeOAuthState(db, stateHash),
  };
}

function createUserStore(db: D1Database): UserStore<MarqueeUser> {
  return {
    async findById(userId) {
      const row = await db
        .prepare("SELECT * FROM users WHERE id = ?1")
        .bind(userId)
        .first<UserRow>();

      return row ? mapUser(row) : null;
    },
  };
}

function createSessionStore(db: D1Database): SessionStore {
  return {
    create: (session) => storeSession(db, session),
    findByTokenHash: (tokenHash) => findSession(db, tokenHash),
    deleteByTokenHash: (tokenHash) => deleteSession(db, tokenHash),
    deleteByUserId: (userId) => deleteUserSessions(db, userId),
  };
}

function createIdentityStore(db: D1Database): IdentityStore<MarqueeUser> {
  return {
    findUser: (provider, subject) => findIdentity(db, provider, subject),
    resolve: (identity) => resolveIdentity(db, identity),
  };
}

async function storeSession(db: D1Database, session: AuthSessionRecord) {
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(
      session.tokenHash,
      session.userId,
      session.createdAt.toISOString(),
      session.expiresAt.toISOString(),
    )
    .run();
}

async function findSession(db: D1Database, tokenHash: string): Promise<AuthSessionRecord | null> {
  const row = await db
    .prepare(
      "SELECT * FROM sessions WHERE token_hash = ?1 AND julianday(expires_at) > julianday('now')",
    )
    .bind(tokenHash)
    .first<{ token_hash: string; user_id: string; created_at: string; expires_at: string }>();

  return row
    ? {
        tokenHash: row.token_hash,
        userId: row.user_id,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
      }
    : null;
}

async function deleteSession(db: D1Database, tokenHash: string) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
}

async function deleteUserSessions(db: D1Database, userId: string) {
  await db.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId).run();
}

async function findIdentity(db: D1Database, provider: string, subject: string) {
  const row = await db
    .prepare(
      `SELECT users.* FROM identities
       JOIN users ON users.id = identities.user_id
       WHERE identities.provider = ?1 AND identities.provider_subject = ?2`,
    )
    .bind(provider, subject)
    .first<UserRow>();

  return row ? mapUser(row) : null;
}

async function resolveIdentity(db: D1Database, identity: ExternalIdentity) {
  if (identity.provider !== "github") {
    throw new AuthError("identity_conflict");
  }

  const login = boundedString(identity.claims.login, 256);

  if (!login) {
    throw new AuthError("provider_error");
  }

  const name = boundedString(identity.claims.name) ?? login;
  const avatarUrl = boundedString(identity.claims.avatar_url);
  const existing = await findIdentity(db, identity.provider, identity.providerSubject);

  if (existing) {
    await db
      .prepare(
        `UPDATE users SET name = ?1, github_login = ?2, avatar_url = ?3
         WHERE id = ?4`,
      )
      .bind(name, login, avatarUrl, existing.id)
      .run();

    return {
      ...existing,
      displayName: name,
      githubLogin: login,
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  }

  const userId = crypto.randomUUID();
  const firstUser = !(await db.prepare("SELECT 1 AS present FROM users LIMIT 1").first());

  await db.batch([
    db
      .prepare(
        "INSERT INTO users (id, name, github_login, avatar_url, role) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .bind(userId, name, login, avatarUrl, firstUser ? "admin" : "viewer"),
    db
      .prepare(
        `INSERT INTO identities (provider, provider_subject, user_id, claims_json)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind("github", identity.providerSubject, userId, JSON.stringify(identity.claims)),
  ]);

  const row = await db.prepare("SELECT * FROM users WHERE id = ?1").bind(userId).first<UserRow>();

  if (!row) {
    throw new AuthError("provider_error");
  }

  return mapUser(row);
}

async function storeOAuthState(db: D1Database, state: OAuthStateRecord) {
  await db
    .prepare(
      `INSERT INTO oauth_states
         (state_hash, provider, code_verifier, nonce, redirect_uri, context_json, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      state.stateHash,
      state.provider,
      state.codeVerifier ?? null,
      state.nonce ?? null,
      state.redirectUri ?? null,
      JSON.stringify(state.context ?? {}),
      state.createdAt.toISOString(),
      state.expiresAt.toISOString(),
    )
    .run();
}

async function consumeOAuthState(
  db: D1Database,
  stateHash: string,
): Promise<OAuthStateRecord | null> {
  const row = await db
    .prepare(
      `DELETE FROM oauth_states
       WHERE state_hash = ?1 AND julianday(expires_at) > julianday('now')
       RETURNING *`,
    )
    .bind(stateHash)
    .first<{
      state_hash: string;
      provider: string;
      code_verifier: string | null;
      nonce: string | null;
      redirect_uri: string | null;
      context_json: string;
      created_at: string;
      expires_at: string;
    }>();

  if (!row) {
    return null;
  }

  const context = parseJson(row.context_json);

  return {
    stateHash: row.state_hash,
    provider: row.provider,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    context:
      context && typeof context === "object" && !Array.isArray(context)
        ? (context as Record<string, string>)
        : {},
    ...(row.code_verifier ? { codeVerifier: row.code_verifier } : {}),
    ...(row.nonce ? { nonce: row.nonce } : {}),
    ...(row.redirect_uri ? { redirectUri: row.redirect_uri } : {}),
  };
}
