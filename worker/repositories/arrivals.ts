import type { ProviderAvailability } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";

const STREAMING_OFFERS = new Set(["Subscription", "Free", "Free with ads"]);
const CONFIRMATIONS = 2;

export type Arrival = {
  titleId: string;
  title: string;
  providerId: string;
  providerName: string;
};

function streamingKind(provider: ProviderAvailability) {
  return provider.offerTypes.some((offer) => STREAMING_OFFERS.has(offer)) ? "streaming" : "paid";
}

export async function recordProviderState(
  db: D1Database,
  titleId: string,
  providers: ProviderAvailability[],
) {
  const seen = new Map<string, string>();

  for (const provider of providers) {
    const kind = streamingKind(provider);

    if (seen.get(provider.id) !== "streaming") {
      seen.set(provider.id, kind);
    }
  }

  if (seen.size === 0) {
    return;
  }

  try {
    await db.batch(
      [...seen.entries()].map(([providerId, kind]) =>
        db
          .prepare(
            `INSERT INTO title_provider_state (title_id, provider_id, offer_kind)
             VALUES (?1, ?2, ?3)
             ON CONFLICT (title_id, provider_id) DO UPDATE SET
               seen_count = seen_count + 1,
               offer_kind = excluded.offer_kind,
               last_seen_at = CURRENT_TIMESTAMP`,
          )
          .bind(titleId, providerId, kind),
      ),
    );
  } catch (error) {
    logError("provider_state_failed", error, { titleId });
  }
}

export async function confirmedArrivals(db: D1Database, sinceHours = 72): Promise<Arrival[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT s.title_id AS titleId, s.provider_id AS providerId, t.title AS title
           FROM title_provider_state AS s
           JOIN catalog_titles AS t ON t.id = s.title_id
          WHERE s.announced_at IS NULL
            AND s.offer_kind = 'streaming'
            AND s.seen_count >= ?1
            AND julianday(s.first_seen_at) > julianday('now', ?2)
          LIMIT 200`,
      )
      .bind(CONFIRMATIONS, `-${Math.max(1, sinceHours)} hours`)
      .all<{ titleId: string; providerId: string; title: string }>();

    return rows.results.map((row) => ({
      titleId: row.titleId,
      title: row.title,
      providerId: row.providerId,
      providerName: row.providerId,
    }));
  } catch (error) {
    logError("arrivals_read_failed", error);

    return [];
  }
}

export async function markAnnounced(db: D1Database, arrivals: Arrival[]) {
  if (arrivals.length === 0) {
    return;
  }

  try {
    await db.batch(
      arrivals.map((arrival) =>
        db
          .prepare(
            `UPDATE title_provider_state SET announced_at = CURRENT_TIMESTAMP
              WHERE title_id = ?1 AND provider_id = ?2`,
          )
          .bind(arrival.titleId, arrival.providerId),
      ),
    );
  } catch (error) {
    logError("arrivals_mark_failed", error);
  }
}

export async function waitingViewers(db: D1Database, titleIds: string[]) {
  if (titleIds.length === 0) {
    return new Map<string, { viewerId: string; email: string; name: string }[]>();
  }

  try {
    const rows = await db
      .prepare(
        `SELECT v.title_id AS titleId, v.viewer_id AS viewerId, u.email AS email, u.name AS name
           FROM viewing_entries AS v
           JOIN users AS u ON u.id = v.viewer_id
          WHERE v.status IN ('watchlist', 'watching')
            AND u.email IS NOT NULL AND u.email != ''
            AND v.title_id IN (${titleIds.map(() => "?").join(",")})`,
      )
      .bind(...titleIds)
      .all<{ titleId: string; viewerId: string; email: string; name: string }>();
    const byTitle = new Map<string, { viewerId: string; email: string; name: string }[]>();

    for (const row of rows.results) {
      byTitle.set(row.titleId, [
        ...(byTitle.get(row.titleId) ?? []),
        { viewerId: row.viewerId, email: row.email, name: row.name },
      ]);
    }

    return byTitle;
  } catch (error) {
    logError("arrival_viewers_failed", error);

    return new Map<string, { viewerId: string; email: string; name: string }[]>();
  }
}

export async function alreadyAlerted(db: D1Database, viewerId: string, titleIds: string[]) {
  if (titleIds.length === 0) {
    return new Set<string>();
  }

  try {
    const rows = await db
      .prepare(
        `SELECT title_id AS titleId FROM viewer_alerts
          WHERE viewer_id = ?1 AND kind = 'arrival'
            AND title_id IN (${titleIds.map(() => "?").join(",")})`,
      )
      .bind(viewerId, ...titleIds)
      .all<{ titleId: string }>();

    return new Set(rows.results.map((row) => row.titleId));
  } catch (error) {
    logError("alert_history_failed", error);

    return new Set<string>();
  }
}

export async function recentAlertCount(db: D1Database, viewerId: string, days = 7) {
  try {
    const row = await db
      .prepare(
        `SELECT count(*) AS total FROM viewer_alerts
          WHERE viewer_id = ?1 AND julianday(sent_at) > julianday('now', ?2)`,
      )
      .bind(viewerId, `-${days} days`)
      .first<{ total: number }>();

    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function noteAlert(db: D1Database, viewerId: string, titleIds: string[]) {
  if (titleIds.length === 0) {
    return;
  }

  try {
    await db.batch(
      titleIds.map((titleId) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO viewer_alerts (viewer_id, title_id, kind)
             VALUES (?1, ?2, 'arrival')`,
          )
          .bind(viewerId, titleId),
      ),
    );
  } catch (error) {
    logError("alert_note_failed", error);
  }
}
