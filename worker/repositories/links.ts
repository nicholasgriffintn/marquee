import { sha256Hex } from "../lib/hash.ts";
import { decryptOAuthToken, encryptOAuthToken } from "../lib/token-crypto.ts";
import type { Bindings } from "../types.ts";

export type LinkProvider = "trakt";

export type LinkRow = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  accountLabel: string | null;
  syncedAt: string | null;
  brokenAt: string | null;
};

const STATE_TTL_SECONDS = 600;

export function hashState(state: string) {
  return sha256Hex(state);
}

export async function storeLinkState(
  env: Bindings,
  provider: LinkProvider,
  viewerId: string,
  state: string,
  returnTo: string | null,
) {
  const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1_000).toISOString();

  await env.DB.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(`DELETE FROM link_states WHERE expires_at < CURRENT_TIMESTAMP`),
    );
    results.push(
      await transaction.execute(
        `INSERT INTO link_states (state_hash, provider, viewer_id, return_to, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
        [await hashState(state), provider, viewerId, returnTo, expiresAt],
      ),
    );

    return results;
  });
}

export async function claimLinkState(env: Bindings, provider: LinkProvider, state: string) {
  const stateHash = await hashState(state);
  const row = await env.DB.first<{ viewerId: string; returnTo: string | null }>(
    `SELECT viewer_id AS "viewerId", return_to AS "returnTo"
     FROM link_states
     WHERE state_hash = $1 AND provider = $2 AND expires_at > CURRENT_TIMESTAMP`,
    [stateHash, provider],
  );

  await env.DB.execute(`DELETE FROM link_states WHERE state_hash = $1`, [stateHash]);

  return row;
}

export async function readLink(env: Bindings, viewerId: string, provider: LinkProvider) {
  const row = await env.DB.first<LinkRow>(
    `SELECT access_token AS "accessToken",
            refresh_token AS "refreshToken",
            expires_at AS "expiresAt",
            account_label AS "accountLabel",
            synced_at AS "syncedAt",
            broken_at AS "brokenAt"
     FROM linked_accounts
     WHERE viewer_id = $1 AND provider = $2`,
    [viewerId, provider],
  );

  if (!row) {
    return row;
  }

  return {
    ...row,
    accessToken: await decryptOAuthToken(env, row.accessToken),
    refreshToken: row.refreshToken ? await decryptOAuthToken(env, row.refreshToken) : null,
  };
}

export async function saveLink(
  env: Bindings,
  viewerId: string,
  provider: LinkProvider,
  link: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  },
  accountLabel: string | null,
) {
  const accessToken = await encryptOAuthToken(env, link.accessToken);
  const refreshToken = link.refreshToken ? await encryptOAuthToken(env, link.refreshToken) : null;

  await env.DB.execute(
    `INSERT INTO linked_accounts
       (viewer_id, provider, access_token, refresh_token, expires_at, account_label)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(viewer_id, provider) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       account_label = COALESCE(excluded.account_label, linked_accounts.account_label),
       broken_at = NULL`,
    [viewerId, provider, accessToken, refreshToken, link.expiresAt, accountLabel],
  );
}

export async function markLinkSynced(env: Bindings, viewerId: string, provider: LinkProvider) {
  await env.DB.execute(
    `UPDATE linked_accounts SET synced_at = CURRENT_TIMESTAMP
     WHERE viewer_id = $1 AND provider = $2`,
    [viewerId, provider],
  );
}

export async function markLinkBroken(env: Bindings, viewerId: string, provider: LinkProvider) {
  await env.DB.execute(
    `UPDATE linked_accounts SET broken_at = COALESCE(broken_at, CURRENT_TIMESTAMP)
     WHERE viewer_id = $1 AND provider = $2`,
    [viewerId, provider],
  );
}

export async function readPushedAt(env: Bindings, viewerId: string, provider: LinkProvider) {
  const row = await env.DB.first<{ pushedAt: string | null }>(
    `SELECT pushed_at AS "pushedAt" FROM linked_accounts WHERE viewer_id = $1 AND provider = $2`,
    [viewerId, provider],
  );

  return row?.pushedAt ?? null;
}

export async function markLinkPushed(
  env: Bindings,
  viewerId: string,
  provider: LinkProvider,
  at: string,
) {
  await env.DB.execute(
    `UPDATE linked_accounts SET pushed_at = $1
     WHERE viewer_id = $2 AND provider = $3`,
    [at, viewerId, provider],
  );
}

export async function deleteLink(env: Bindings, viewerId: string, provider: LinkProvider) {
  const result = await env.DB.execute(
    `DELETE FROM linked_accounts WHERE viewer_id = $1 AND provider = $2`,
    [viewerId, provider],
  );

  return result.rowCount > 0;
}
