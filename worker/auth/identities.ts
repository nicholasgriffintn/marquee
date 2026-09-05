import { AuthError, type ExternalIdentity } from "@ngriffin_uk/auth-core";

import { boundedString } from "../lib/values.ts";
import { mapUser, type UserRow } from "./model.ts";

export async function findIdentity(db: Database, provider: string, subject: string) {
  const row = await db.first<UserRow>(
    `SELECT users.* FROM identities
       JOIN users ON users.id = identities.user_id
       WHERE identities.provider = $1 AND identities.provider_subject = $2`,
    [provider, subject],
  );

  return row ? mapUser(row) : null;
}

export async function resolveIdentity(db: Database, identity: ExternalIdentity) {
  if (identity.provider !== "github" && identity.provider !== "google") {
    throw new AuthError("identity_conflict");
  }

  const login = identity.provider === "github" ? boundedString(identity.claims.login, 256) : "";

  if (login === null) {
    throw new AuthError("provider_error");
  }

  const name = boundedString(identity.claims.name) ?? (login || "Guest");
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
        [identity.provider, identity.providerSubject, userId, JSON.stringify(identity.claims)],
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
