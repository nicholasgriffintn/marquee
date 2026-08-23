import { logError } from "../lib/logging.ts";
import type { AlertKind } from "../services/alerts/types.ts";

export type AlertRecord = {
  viewerId: string;
  kind: AlertKind;
  key: string;
  titleId: string;
  detail: string;
};

export async function alreadySent(db: D1Database, viewerId: string, kind: AlertKind) {
  try {
    const rows = await db
      .prepare(`SELECT alert_key AS key FROM viewer_alerts WHERE viewer_id = ?1 AND kind = ?2`)
      .bind(viewerId, kind)
      .all<{ key: string }>();

    return new Set(rows.results.map((row) => row.key));
  } catch (error) {
    logError("alerts_history_failed", error);

    return new Set<string>();
  }
}

export async function sentThisWeek(db: D1Database, viewerId: string, days = 7) {
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

export async function mutedKinds(db: D1Database, viewerId: string) {
  try {
    const rows = await db
      .prepare(`SELECT kind FROM viewer_alert_settings WHERE viewer_id = ?1 AND enabled = 0`)
      .bind(viewerId)
      .all<{ kind: string }>();

    return new Set(rows.results.map((row) => row.kind));
  } catch {
    return new Set<string>();
  }
}

export async function recordSent(db: D1Database, records: AlertRecord[]) {
  if (records.length === 0) {
    return;
  }

  try {
    await db.batch(
      records.map((record) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO viewer_alerts (viewer_id, kind, alert_key, title_id, detail)
             VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(record.viewerId, record.kind, record.key, record.titleId, record.detail),
      ),
    );
  } catch (error) {
    logError("alerts_record_failed", error);
  }
}

export async function viewerContacts(db: D1Database, viewerIds: string[]) {
  if (viewerIds.length === 0) {
    return new Map<string, { email: string; name: string }>();
  }

  try {
    const rows = await db
      .prepare(
        `SELECT id, alert_email AS email, name FROM users
          WHERE alert_email IS NOT NULL AND alert_email != ''
            AND alert_email_verified_at IS NOT NULL
            AND id IN (${viewerIds.map(() => "?").join(",")})`,
      )
      .bind(...viewerIds)
      .all<{ id: string; email: string; name: string }>();

    return new Map(rows.results.map((row) => [row.id, { email: row.email, name: row.name }]));
  } catch (error) {
    logError("alerts_contacts_failed", error);

    return new Map<string, { email: string; name: string }>();
  }
}

export async function readAlertEmail(db: D1Database, viewerId: string) {
  try {
    const row = await db
      .prepare(
        `SELECT alert_email AS email, alert_email_verified_at AS verifiedAt
           FROM users WHERE id = ?1`,
      )
      .bind(viewerId)
      .first<{ email: string | null; verifiedAt: string | null }>();

    return { email: row?.email ?? "", verified: Boolean(row?.verifiedAt) };
  } catch (error) {
    logError("alert_email_read_failed", error);

    return { email: "", verified: false };
  }
}

export async function stageAlertEmail(
  db: D1Database,
  viewerId: string,
  email: string,
  tokenHash: string,
  minutes: number,
) {
  await db.batch([
    db
      .prepare(`UPDATE users SET alert_email = ?2, alert_email_verified_at = NULL WHERE id = ?1`)
      .bind(viewerId, email),
    db.prepare(`DELETE FROM alert_email_tokens WHERE viewer_id = ?1`).bind(viewerId),
    db
      .prepare(
        `INSERT INTO alert_email_tokens (token_hash, viewer_id, email, expires_at)
         VALUES (?1, ?2, ?3, datetime('now', ?4))`,
      )
      .bind(tokenHash, viewerId, email, `+${minutes} minutes`),
  ]);
}

export async function confirmAlertEmail(db: D1Database, tokenHash: string) {
  const row = await db
    .prepare(
      `DELETE FROM alert_email_tokens
        WHERE token_hash = ?1 AND julianday(expires_at) > julianday('now')
        RETURNING viewer_id AS viewerId, email`,
    )
    .bind(tokenHash)
    .first<{ viewerId: string; email: string }>();

  if (!row) {
    return false;
  }

  await db
    .prepare(
      `UPDATE users SET alert_email = ?2, alert_email_verified_at = CURRENT_TIMESTAMP
        WHERE id = ?1`,
    )
    .bind(row.viewerId, row.email)
    .run();

  return true;
}

export async function readAlertSettings(db: D1Database, viewerId: string) {
  try {
    const rows = await db
      .prepare(`SELECT kind, enabled FROM viewer_alert_settings WHERE viewer_id = ?1`)
      .bind(viewerId)
      .all<{ kind: string; enabled: number }>();

    return new Map(rows.results.map((row) => [row.kind, row.enabled === 1]));
  } catch {
    return new Map<string, boolean>();
  }
}

export async function setAlertSetting(
  db: D1Database,
  viewerId: string,
  kind: string,
  enabled: boolean,
) {
  await db
    .prepare(
      `INSERT INTO viewer_alert_settings (viewer_id, kind, enabled, updated_at)
       VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
       ON CONFLICT (viewer_id, kind) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(viewerId, kind, enabled ? 1 : 0)
    .run();
}
