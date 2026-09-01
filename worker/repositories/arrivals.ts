import type { ProviderAvailability } from "../../src/domain/catalog.ts";
import { isStreamingOffer } from "../../src/domain/providers.ts";
import { preferredLanguageCondition } from "../lib/languages.ts";
import { logError } from "../lib/logging.ts";

const CONFIRMATIONS = 2;

export type Arrival = {
  titleId: string;
  title: string;
  providerId: string;
  providerName: string;
};

function streamingKind(provider: ProviderAvailability) {
  return provider.offerTypes.some(isStreamingOffer) ? "streaming" : "paid";
}

export async function recordProviderState(
  db: Database,
  titleId: string,
  providers: ProviderAvailability[],
  baseline: boolean,
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
    await db.transaction(async (transaction) => {
      for (const [providerId, kind] of seen) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO title_provider_state (title_id, provider_id, offer_kind, announced_at)
             VALUES ($1, $2, $3, ${baseline ? "CURRENT_TIMESTAMP" : "NULL"})
             ON CONFLICT (title_id, provider_id) DO UPDATE SET
               seen_count = title_provider_state.seen_count + 1,
               offer_kind = excluded.offer_kind,
               last_seen_at = CURRENT_TIMESTAMP`,
          [titleId, providerId, kind],
        );
      }
    });
  } catch (error) {
    logError("provider_state_failed", error, { titleId });
  }
}

export async function confirmedArrivals(db: Database, sinceHours = 72): Promise<Arrival[]> {
  try {
    const rows = await db.query<{ titleId: string; providerId: string; title: string }>(
      `SELECT s.title_id AS "titleId", s.provider_id AS "providerId", t.title AS title
           FROM title_provider_state AS s
           JOIN catalog_titles AS t ON t.id = s.title_id
          WHERE s.announced_at IS NULL
            AND s.offer_kind = 'streaming'
            AND s.seen_count >= $1
            AND s.last_seen_at > (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))
          LIMIT 200`,
      [CONFIRMATIONS, `-${Math.max(1, sinceHours)} hours`],
    );

    return rows.rows.map((row) => ({
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

export async function settleAnnounced(db: Database, arrivals: Arrival[]) {
  if (arrivals.length === 0) {
    return;
  }

  try {
    await db.transaction(async (transaction) => {
      for (const arrival of arrivals) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `UPDATE title_provider_state SET announced_at = CURRENT_TIMESTAMP
              WHERE title_id = $1 AND provider_id = $2
                AND announced_at IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM viewing_entries AS v
                    JOIN users AS u ON u.id = v.viewer_id
                    JOIN catalog_titles AS t ON t.id = v.title_id
                    LEFT JOIN viewer_preferences AS p ON p.viewer_id = v.viewer_id
                   WHERE v.title_id = title_provider_state.title_id
                     AND v.status IN ('watchlist', 'watching')
                     AND ${preferredLanguageCondition("t", "COALESCE(p.preferred_language, 'en')")}
                     AND u.email IS NOT NULL AND u.email != ''
                     AND NOT EXISTS (
                       SELECT 1 FROM viewer_alert_settings AS s
                        WHERE s.viewer_id = v.viewer_id
                          AND s.kind = 'arrival' AND s.enabled = 0)
                     AND NOT EXISTS (
                       SELECT 1 FROM viewer_alerts AS a
                        WHERE a.viewer_id = v.viewer_id
                          AND a.kind = 'arrival'
                          AND a.alert_key = title_provider_state.title_id
                                            || ':' || title_provider_state.provider_id))`,
          [arrival.titleId, arrival.providerId],
        );
      }
    });
  } catch (error) {
    logError("arrivals_settle_failed", error);
  }
}

export async function waitingViewers(db: Database, titleIds: string[]) {
  if (titleIds.length === 0) {
    return new Map<string, { viewerId: string; email: string; name: string }[]>();
  }

  try {
    const rows = await db.query<{ titleId: string; viewerId: string; email: string; name: string }>(
      `SELECT v.title_id AS "titleId", v.viewer_id AS "viewerId", u.email AS email, u.name AS name
           FROM viewing_entries AS v
           JOIN users AS u ON u.id = v.viewer_id
           JOIN catalog_titles AS t ON t.id = v.title_id
           LEFT JOIN viewer_preferences AS p ON p.viewer_id = v.viewer_id
          WHERE v.status IN ('watchlist', 'watching')
            AND u.email IS NOT NULL AND u.email != ''
            AND ${preferredLanguageCondition("t", "COALESCE(p.preferred_language, 'en')")}
            AND v.title_id IN (${titleIds.map((_, index) => `$${index + 1}`).join(",")})`,
      [...titleIds],
    );
    const byTitle = new Map<string, { viewerId: string; email: string; name: string }[]>();

    for (const row of rows.rows) {
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

export async function alreadyAlerted(db: Database, viewerId: string, titleIds: string[]) {
  if (titleIds.length === 0) {
    return new Set<string>();
  }

  try {
    const rows = await db.query<{ titleId: string }>(
      `SELECT title_id AS "titleId" FROM viewer_alerts
          WHERE viewer_id = $1 AND kind = 'arrival'
            AND title_id IN (${titleIds.map((_, index) => `$${index + 2}`).join(",")})`,
      [viewerId, ...titleIds],
    );

    return new Set(rows.rows.map((row) => row.titleId));
  } catch (error) {
    logError("alert_history_failed", error);

    return new Set<string>();
  }
}

export async function recentAlertCount(db: Database, viewerId: string, days = 7) {
  try {
    const row = await db.first<{ total: number }>(
      `SELECT count(*) AS total FROM viewer_alerts
          WHERE viewer_id = $1 AND sent_at > (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))`,
      [viewerId, `-${days} days`],
    );

    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function noteAlert(db: Database, viewerId: string, titleIds: string[]) {
  if (titleIds.length === 0) {
    return;
  }

  try {
    await db.transaction(async (transaction) => {
      for (const titleId of titleIds) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO viewer_alerts (viewer_id, title_id, kind)
             VALUES ($1, $2, 'arrival')
             ON CONFLICT DO NOTHING`,
          [viewerId, titleId],
        );
      }
    });
  } catch (error) {
    logError("alert_note_failed", error);
  }
}
