import {
  createAuth,
  type AuthSessionRecord,
  type ChallengeStore,
  type IdentityStore,
  type SessionStore,
  type UserStore,
} from "@ngriffin_uk/auth-core";
import type { OAuthStateRecord, OAuthStateStore } from "@ngriffin_uk/auth-oauth2";

import {
  mapChallenge,
  mapOAuthState,
  type ChallengeRow,
  type OAuthStateRow,
} from "../lib/auth-records.ts";
import { findIdentity, resolveIdentity } from "./identities.ts";
import { mapUser, type MarqueeUser, type UserRow } from "./model.ts";

export function createDatabaseAuth(db: Database) {
  return createAuth({
    users: createUserStore(db),
    sessions: createSessionStore(db),
    identities: createIdentityStore(db),
    challenges: createDatabaseChallengeStore(db),
  });
}

export function createDatabaseChallengeStore(db: Database): ChallengeStore {
  return {
    async create(challenge) {
      await db.execute(
        `INSERT INTO auth_challenges
             (token_hash, provider, kind, payload, attempts, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          challenge.tokenHash,
          challenge.provider,
          challenge.kind,
          JSON.stringify(challenge.payload),
          challenge.attempts,
          challenge.createdAt.toISOString(),
          challenge.expiresAt.toISOString(),
        ],
      );
    },
    async findByTokenHash(tokenHash) {
      const row = await db.first<ChallengeRow>(
        `SELECT * FROM auth_challenges WHERE token_hash = $1`,
        [tokenHash],
      );

      return row ? mapChallenge(row) : null;
    },
    async consumeByTokenHash(tokenHash) {
      const row = await db.first<ChallengeRow>(
        `DELETE FROM auth_challenges WHERE token_hash = $1 RETURNING *`,
        [tokenHash],
      );

      return row ? mapChallenge(row) : null;
    },
    async incrementAttempts(tokenHash, expectedAttempts) {
      const result = await db.execute(
        `UPDATE auth_challenges SET attempts = attempts + 1
           WHERE token_hash = $1 AND attempts = $2`,
        [tokenHash, expectedAttempts],
      );

      return (result.rowCount ?? 0) > 0;
    },
  };
}

export async function findOrCreateByEmail(db: Database, email: string) {
  const existing = await db.first<UserRow>("SELECT * FROM users WHERE email = $1", [email]);

  if (existing) {
    return mapUser(existing);
  }

  const id = crypto.randomUUID();
  const name = email.split("@")[0]?.slice(0, 60) || "Guest";

  await db.execute(
    `INSERT INTO users (id, name, github_login, avatar_url, email, role)
       VALUES ($1, $2, '', NULL, $3, 'viewer')`,
    [id, name, email],
  );

  const created = await db.first<UserRow>("SELECT * FROM users WHERE id = $1", [id]);

  return created ? mapUser(created) : null;
}

export function createDatabaseOAuthStateStore(db: Database): OAuthStateStore {
  return {
    create: (state) => storeOAuthState(db, state),
    consumeByStateHash: (stateHash) => consumeOAuthState(db, stateHash),
  };
}

function createUserStore(db: Database): UserStore<MarqueeUser> {
  return {
    async findById(userId) {
      const row = await db.first<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);

      return row ? mapUser(row) : null;
    },
  };
}

function createSessionStore(db: Database): SessionStore {
  return {
    create: (session) => storeSession(db, session),
    findByTokenHash: (tokenHash) => findSession(db, tokenHash),
    deleteByTokenHash: (tokenHash) => deleteSession(db, tokenHash),
    deleteByUserId: (userId) => deleteUserSessions(db, userId),
  };
}

function createIdentityStore(db: Database): IdentityStore<MarqueeUser> {
  return {
    findUser: (provider, subject) => findIdentity(db, provider, subject),
    resolve: (identity) => resolveIdentity(db, identity),
  };
}

async function storeSession(db: Database, session: AuthSessionRecord) {
  await db.execute(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    [
      session.tokenHash,
      session.userId,
      session.createdAt.toISOString(),
      session.expiresAt.toISOString(),
    ],
  );
}

async function findSession(db: Database, tokenHash: string): Promise<AuthSessionRecord | null> {
  const row = await db.first<{
    token_hash: string;
    user_id: string;
    created_at: string;
    expires_at: string;
  }>("SELECT * FROM sessions WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP", [
    tokenHash,
  ]);

  return row
    ? {
        tokenHash: row.token_hash,
        userId: row.user_id,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
      }
    : null;
}

async function deleteSession(db: Database, tokenHash: string) {
  await db.execute("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

async function deleteUserSessions(db: Database, userId: string) {
  await db.execute("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

async function storeOAuthState(db: Database, state: OAuthStateRecord) {
  await db.execute(
    `INSERT INTO oauth_states
         (state_hash, provider, code_verifier, nonce, redirect_uri, context_json, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      state.stateHash,
      state.provider,
      state.codeVerifier ?? null,
      state.nonce ?? null,
      state.redirectUri ?? null,
      JSON.stringify(state.context ?? {}),
      state.createdAt.toISOString(),
      state.expiresAt.toISOString(),
    ],
  );
}

async function consumeOAuthState(
  db: Database,
  stateHash: string,
): Promise<OAuthStateRecord | null> {
  const row = await db.first<OAuthStateRow>(
    `DELETE FROM oauth_states
       WHERE state_hash = $1 AND expires_at > CURRENT_TIMESTAMP
       RETURNING *`,
    [stateHash],
  );

  if (!row) {
    return null;
  }

  return mapOAuthState(row);
}
