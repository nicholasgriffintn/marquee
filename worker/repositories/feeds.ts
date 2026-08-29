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

export async function storeFeedToken(db: Database, viewerId: string, token: string) {
  const tokenHash = await hashState(token);

  await db.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(`DELETE FROM viewer_feeds WHERE viewer_id = $1`, [viewerId]),
    );
    results.push(
      await transaction.execute(
        `INSERT INTO viewer_feeds (token_hash, viewer_id) VALUES ($1, $2)`,
        [tokenHash, viewerId],
      ),
    );

    return results;
  });
}

export async function readFeedKey(db: Database, viewerId: string): Promise<FeedKey | null> {
  try {
    const row = await db.first<FeedKey>(
      `SELECT created_at AS "createdAt", last_used_at AS "lastUsedAt"
           FROM viewer_feeds WHERE viewer_id = $1`,
      [viewerId],
    );

    return row ?? null;
  } catch (error) {
    logError("feed_key_read_failed", error);

    return null;
  }
}

export async function revokeFeedToken(db: Database, viewerId: string) {
  await db.execute(`DELETE FROM viewer_feeds WHERE viewer_id = $1`, [viewerId]);
}

export async function feedViewerFor(db: Database, token: string) {
  if (!isFeedToken(token)) {
    return null;
  }

  try {
    const tokenHash = await hashState(token);
    const row = await db.first<{ viewerId: string }>(
      `SELECT viewer_id AS "viewerId" FROM viewer_feeds WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!row) {
      return null;
    }

    await db.execute(
      `UPDATE viewer_feeds SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
      [tokenHash],
    );

    return row.viewerId;
  } catch (error) {
    logError("feed_token_lookup_failed", error);

    return null;
  }
}

export async function subscribedViewers(db: Database, viewerIds: string[]) {
  if (viewerIds.length === 0) {
    return new Set<string>();
  }

  try {
    const rows = await db.query<{ viewerId: string }>(
      `SELECT viewer_id AS "viewerId" FROM viewer_feeds
          WHERE viewer_id IN (${viewerIds.map((_, index) => `$${index + 1}`).join(",")})`,
      [...viewerIds],
    );

    return new Set(rows.rows.map((row) => row.viewerId));
  } catch (error) {
    logError("feed_subscribers_failed", error);

    return new Set<string>();
  }
}
