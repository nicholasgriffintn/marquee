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

async function findIdentity(db: Database, provider: string, subject: string) {
  const row = await db.first<UserRow>(
    `SELECT users.* FROM identities
       JOIN users ON users.id = identities.user_id
       WHERE identities.provider = $1 AND identities.provider_subject = $2`,
    [provider, subject],
  );

  return row ? mapUser(row) : null;
}

async function resolveIdentity(db: Database, identity: ExternalIdentity) {
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
    await db.execute(
      `UPDATE users SET name = $1, github_login = $2, avatar_url = $3
         WHERE id = $4`,
      [name, login, avatarUrl, existing.id],
    );

    return {
      ...existing,
      displayName: name,
      githubLogin: login,
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  }

  const userId = crypto.randomUUID();

  await db.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(
        "INSERT INTO users (id, name, github_login, avatar_url, role) VALUES ($1, $2, $3, $4, 'viewer')",
        [userId, name, login, avatarUrl],
      ),
    );
    results.push(
      await transaction.execute(
        `INSERT INTO identities (provider, provider_subject, user_id, claims_json)
         VALUES ($1, $2, $3, $4)`,
        ["github", identity.providerSubject, userId, JSON.stringify(identity.claims)],
      ),
    );

    return results;
  });

  const row = await db.first<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);

  if (!row) {
    throw new AuthError("provider_error");
  }

  return mapUser(row);
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
  const row = await db.first<{
    state_hash: string;
    provider: string;
    code_verifier: string | null;
    nonce: string | null;
    redirect_uri: string | null;
    context_json: string;
    created_at: string;
    expires_at: string;
  }>(
    `DELETE FROM oauth_states
       WHERE state_hash = $1 AND expires_at > CURRENT_TIMESTAMP
       RETURNING *`,
    [stateHash],
  );

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
