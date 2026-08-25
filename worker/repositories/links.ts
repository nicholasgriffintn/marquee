import type { Bindings } from "../types.ts";

export type LinkProvider = "trakt";

export type LinkRow = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  accountLabel: string | null;
  syncedAt: string | null;
};

const STATE_TTL_SECONDS = 600;

export async function hashState(state: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function storeLinkState(
  env: Bindings,
  provider: LinkProvider,
  viewerId: string,
  state: string,
  returnTo: string | null,
) {
  const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1_000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM link_states WHERE expires_at < datetime('now')`),
    env.DB.prepare(
      `INSERT INTO link_states (state_hash, provider, viewer_id, return_to, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(await hashState(state), provider, viewerId, returnTo, expiresAt),
  ]);
}

export async function claimLinkState(env: Bindings, provider: LinkProvider, state: string) {
  const stateHash = await hashState(state);
  const row = await env.DB.prepare(
    `SELECT viewer_id AS viewerId, return_to AS returnTo
     FROM link_states
     WHERE state_hash = ? AND provider = ? AND expires_at > datetime('now')`,
  )
    .bind(stateHash, provider)
    .first<{ viewerId: string; returnTo: string | null }>();

  await env.DB.prepare(`DELETE FROM link_states WHERE state_hash = ?`).bind(stateHash).run();

  return row;
}

export async function readLink(env: Bindings, viewerId: string, provider: LinkProvider) {
  return env.DB.prepare(
    `SELECT access_token AS accessToken,
            refresh_token AS refreshToken,
            expires_at AS expiresAt,
            account_label AS accountLabel,
            synced_at AS syncedAt
     FROM linked_accounts
     WHERE viewer_id = ? AND provider = ?`,
  )
    .bind(viewerId, provider)
    .first<LinkRow>();
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
  await env.DB.prepare(
    `INSERT INTO linked_accounts
       (viewer_id, provider, access_token, refresh_token, expires_at, account_label)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(viewer_id, provider) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       account_label = COALESCE(excluded.account_label, linked_accounts.account_label)`,
  )
    .bind(viewerId, provider, link.accessToken, link.refreshToken, link.expiresAt, accountLabel)
    .run();
}

export async function markLinkSynced(env: Bindings, viewerId: string, provider: LinkProvider) {
  await env.DB.prepare(
    `UPDATE linked_accounts SET synced_at = CURRENT_TIMESTAMP
     WHERE viewer_id = ? AND provider = ?`,
  )
    .bind(viewerId, provider)
    .run();
}

export async function readPushedAt(env: Bindings, viewerId: string, provider: LinkProvider) {
  const row = await env.DB.prepare(
    `SELECT pushed_at AS pushedAt FROM linked_accounts WHERE viewer_id = ? AND provider = ?`,
  )
    .bind(viewerId, provider)
    .first<{ pushedAt: string | null }>();

  return row?.pushedAt ?? null;
}

export async function markLinkPushed(
  env: Bindings,
  viewerId: string,
  provider: LinkProvider,
  at: string,
) {
  await env.DB.prepare(
    `UPDATE linked_accounts SET pushed_at = ?
     WHERE viewer_id = ? AND provider = ?`,
  )
    .bind(at, viewerId, provider)
    .run();
}

export async function deleteLink(env: Bindings, viewerId: string, provider: LinkProvider) {
  const result = await env.DB.prepare(
    `DELETE FROM linked_accounts WHERE viewer_id = ? AND provider = ?`,
  )
    .bind(viewerId, provider)
    .run();

  return result.meta.changes > 0;
}
