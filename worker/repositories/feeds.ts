import { logError } from "../lib/logging.ts";
import { hashState } from "./links.ts";

const TOKEN_PREFIX = "mqf_";
const TOKEN_PATTERN = /^mqf_[0-9a-f]{64}$/u;

export type FeedKey = { createdAt: string; lastUsedAt: string | null };

export function mintFeedToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return `${TOKEN_PREFIX}${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function isFeedToken(value: string) {
  return TOKEN_PATTERN.test(value);
}

export async function storeFeedToken(db: D1Database, viewerId: string, token: string) {
  const tokenHash = await hashState(token);

  await db.batch([
    db.prepare(`DELETE FROM viewer_feeds WHERE viewer_id = ?1`).bind(viewerId),
    db
      .prepare(`INSERT INTO viewer_feeds (token_hash, viewer_id) VALUES (?1, ?2)`)
      .bind(tokenHash, viewerId),
  ]);
}

export async function readFeedKey(db: D1Database, viewerId: string): Promise<FeedKey | null> {
  try {
    const row = await db
      .prepare(
        `SELECT created_at AS createdAt, last_used_at AS lastUsedAt
           FROM viewer_feeds WHERE viewer_id = ?1`,
      )
      .bind(viewerId)
      .first<FeedKey>();

    return row ?? null;
  } catch (error) {
    logError("feed_key_read_failed", error);

    return null;
  }
}

export async function revokeFeedToken(db: D1Database, viewerId: string) {
  await db.prepare(`DELETE FROM viewer_feeds WHERE viewer_id = ?1`).bind(viewerId).run();
}

export async function feedViewerFor(db: D1Database, token: string) {
  if (!isFeedToken(token)) {
    return null;
  }

  try {
    const tokenHash = await hashState(token);
    const row = await db
      .prepare(`SELECT viewer_id AS viewerId FROM viewer_feeds WHERE token_hash = ?1`)
      .bind(tokenHash)
      .first<{ viewerId: string }>();

    if (!row) {
      return null;
    }

    await db
      .prepare(`UPDATE viewer_feeds SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?1`)
      .bind(tokenHash)
      .run();

    return row.viewerId;
  } catch (error) {
    logError("feed_token_lookup_failed", error);

    return null;
  }
}

export async function subscribedViewers(db: D1Database, viewerIds: string[]) {
  if (viewerIds.length === 0) {
    return new Set<string>();
  }

  try {
    const rows = await db
      .prepare(
        `SELECT viewer_id AS viewerId FROM viewer_feeds
          WHERE viewer_id IN (${viewerIds.map(() => "?").join(",")})`,
      )
      .bind(...viewerIds)
      .all<{ viewerId: string }>();

    return new Set(rows.results.map((row) => row.viewerId));
  } catch (error) {
    logError("feed_subscribers_failed", error);

    return new Set<string>();
  }
}
