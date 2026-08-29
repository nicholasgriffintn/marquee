import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import type { AlertKind } from "../services/alerts/types.ts";

export type AlertRecord = {
  viewerId: string;
  kind: AlertKind;
  key: string;
  titleId: string;
  detail: string;
  channel: "email" | "feed";
};

export async function alreadySent(db: Database, viewerId: string, kind: AlertKind) {
  try {
    const rows = await db.query<{ key: string }>(
      `SELECT alert_key AS key FROM viewer_alerts WHERE viewer_id = $1 AND kind = $2`,
      [viewerId, kind],
    );

    return new Set(rows.rows.map((row) => row.key));
  } catch (error) {
    logError("alerts_history_failed", error);

    return new Set<string>();
  }
}

export async function sentThisWeek(db: Database, viewerId: string, days = 7) {
  try {
    const row = await db.first<{ total: number }>(
      `SELECT count(*) AS total FROM viewer_alerts
          WHERE viewer_id = $1 AND (EXTRACT(EPOCH FROM sent_at) / 86400.0) > (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))) / 86400.0)`,
      [viewerId, `-${days} days`],
    );

    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function mutedKinds(db: Database, viewerId: string) {
  try {
    const rows = await db.query<{ kind: string }>(
      `SELECT kind FROM viewer_alert_settings WHERE viewer_id = $1 AND enabled = 0`,
      [viewerId],
    );

    return new Set(rows.rows.map((row) => row.kind));
  } catch {
    return new Set<string>();
  }
}

export async function recordSent(db: Database, records: AlertRecord[]) {
  if (records.length === 0) {
    return;
  }

  try {
    await db.transaction(async (transaction) => {
      for (const record of records) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO viewer_alerts (viewer_id, kind, alert_key, title_id, detail, channel)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
          [record.viewerId, record.kind, record.key, record.titleId, record.detail, record.channel],
        );
      }
    });
  } catch (error) {
    logError("alerts_record_failed", error);
  }
}

export async function viewerContacts(db: Database, viewerIds: string[]) {
  if (viewerIds.length === 0) {
    return new Map<string, { email: string; name: string }>();
  }

  try {
    const rows = await db.query<{ id: string; email: string; name: string }>(
      `SELECT id, alert_email AS email, name FROM users
          WHERE alert_email IS NOT NULL AND alert_email != ''
            AND alert_email_verified_at IS NOT NULL
            AND id IN (${viewerIds.map((_, index) => `$${index + 1}`).join(",")})`,
      [...viewerIds],
    );

    return new Map(rows.rows.map((row) => [row.id, { email: row.email, name: row.name }]));
  } catch (error) {
    logError("alerts_contacts_failed", error);

    return new Map<string, { email: string; name: string }>();
  }
}

export async function readAlertEmail(db: Database, viewerId: string) {
  try {
    const row = await db.first<{ email: string | null; verifiedAt: string | null }>(
      `SELECT alert_email AS email, alert_email_verified_at AS "verifiedAt"
           FROM users WHERE id = $1`,
      [viewerId],
    );

    return { email: row?.email ?? "", verified: Boolean(row?.verifiedAt) };
  } catch (error) {
    logError("alert_email_read_failed", error);

    return { email: "", verified: false };
  }
}

export async function stageAlertEmail(
  db: Database,
  viewerId: string,
  email: string,
  tokenHash: string,
  minutes: number,
) {
  await db.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(
        `UPDATE users SET alert_email = $2, alert_email_verified_at = NULL WHERE id = $1`,
        [viewerId, email],
      ),
    );
    results.push(
      await transaction.execute(`DELETE FROM alert_email_tokens WHERE viewer_id = $1`, [viewerId]),
    );
    results.push(
      await transaction.execute(
        `INSERT INTO alert_email_tokens (token_hash, viewer_id, email, expires_at)
         VALUES ($1, $2, $3, (CURRENT_TIMESTAMP + CAST($4 AS INTERVAL)))`,
        [tokenHash, viewerId, email, `+${minutes} minutes`],
      ),
    );

    return results;
  });
}

export async function confirmAlertEmail(db: Database, tokenHash: string) {
  const row = await db.first<{ viewerId: string; email: string }>(
    `DELETE FROM alert_email_tokens
        WHERE token_hash = $1 AND (EXTRACT(EPOCH FROM expires_at) / 86400.0) > (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400.0)
        RETURNING viewer_id AS "viewerId", email`,
    [tokenHash],
  );

  if (!row) {
    return false;
  }

  await db.execute(
    `UPDATE users SET alert_email = $2, alert_email_verified_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
    [row.viewerId, row.email],
  );

  return true;
}

export async function readAlertSettings(db: Database, viewerId: string) {
  try {
    const rows = await db.query<{ kind: string; enabled: number }>(
      `SELECT kind, enabled FROM viewer_alert_settings WHERE viewer_id = $1`,
      [viewerId],
    );

    return new Map(rows.rows.map((row) => [row.kind, row.enabled === 1]));
  } catch {
    return new Map<string, boolean>();
  }
}

export async function setAlertSetting(
  db: Database,
  viewerId: string,
  kind: string,
  enabled: boolean,
) {
  await db.execute(
    `INSERT INTO viewer_alert_settings (viewer_id, kind, enabled, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (viewer_id, kind) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = CURRENT_TIMESTAMP`,
    [viewerId, kind, enabled ? 1 : 0],
  );
}

export type SentAlert = {
  kind: string;
  key: string;
  titleId: string | null;
  detail: string;
  sentAt: string;
};

export async function recentAlerts(db: Database, viewerId: string, limit = 40) {
  try {
    const rows = await db.query<SentAlert>(
      `SELECT kind, alert_key AS key, title_id AS "titleId", detail, sent_at AS "sentAt"
           FROM viewer_alerts
          WHERE viewer_id = $1
          ORDER BY sent_at DESC
          LIMIT $2`,
      [viewerId, clamp(limit, 1, 100)],
    );

    return rows.rows;
  } catch (error) {
    logError("alerts_recent_failed", error);

    return [];
  }
}
