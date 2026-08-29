import { sha256Hex } from "../lib/hash.ts";
import { logError } from "../lib/logging.ts";

const REVISION_SCHEME = "r1";

type RevisionRow = {
  shelf: string | null;
  feedback: string | null;
  signals: string | null;
  answers: string | null;
  providers: string | null;
};

export async function readRailRevision(db: D1Database, viewerId: string) {
  try {
    const row = await db
      .prepare(
        `SELECT
           (SELECT count(*) || ':' || coalesce(max(updated_at), '')
              FROM viewing_entries WHERE viewer_id = ?1) AS shelf,
           (SELECT count(*) || ':' || coalesce(max(created_at), '')
              FROM rail_feedback WHERE viewer_id = ?1) AS feedback,
           (SELECT count(*) || ':' || coalesce(max(created_at), '')
              FROM viewer_signals
             WHERE viewer_id = ?1
               AND (expires_at IS NULL OR expires_at > datetime('now'))) AS signals,
           (SELECT count(*) || ':' || coalesce(max(answered_at), '')
              FROM viewer_answers WHERE viewer_id = ?1) AS answers,
           (SELECT selected_provider_ids || ':' || updated_at
              FROM viewer_preferences WHERE viewer_id = ?1) AS providers`,
      )
      .bind(viewerId)
      .first<RevisionRow>();
    const parts = [
      row?.shelf ?? "",
      row?.feedback ?? "",
      row?.signals ?? "",
      row?.answers ?? "",
      row?.providers ?? "",
    ];

    return `${REVISION_SCHEME}-${await sha256Hex(parts.join("|"), 16)}`;
  } catch (error) {
    logError("rail_revision_failed", error);

    return "";
  }
}
