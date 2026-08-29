import { sha256Hex } from "../lib/hash.ts";
import { logError } from "../lib/logging.ts";

const REVISION_SCHEME = "r2";

type RevisionRow = {
  shelf: string | null;
  feedback: string | null;
  signals: string | null;
  answers: string | null;
  providers: string | null;
  beliefs: string | null;
};

export async function readRailRevision(db: Database, viewerId: string) {
  try {
    const row = await db.first<RevisionRow>(
      `SELECT
           (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '')
              FROM viewing_entries WHERE viewer_id = $1) AS shelf,
           (SELECT count(*) || ':' || coalesce(max(created_at)::text, '')
              FROM rail_feedback WHERE viewer_id = $1) AS feedback,
           (SELECT count(*) || ':' || coalesce(max(created_at)::text, '')
              FROM viewer_signals
             WHERE viewer_id = $1
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)) AS signals,
           (SELECT count(*) || ':' || coalesce(max(answered_at)::text, '')
              FROM viewer_answers WHERE viewer_id = $1) AS answers,
           (SELECT selected_provider_ids || ':' || updated_at::text
              FROM viewer_preferences WHERE viewer_id = $1) AS providers,
           (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '')
              FROM viewer_beliefs
             WHERE viewer_id = $1 AND revoked_at IS NULL) AS beliefs`,
      [viewerId],
    );
    const parts = [
      row?.shelf ?? "",
      row?.feedback ?? "",
      row?.signals ?? "",
      row?.answers ?? "",
      row?.providers ?? "",
      row?.beliefs ?? "",
    ];

    return `${REVISION_SCHEME}-${await sha256Hex(parts.join("|"), 16)}`;
  } catch (error) {
    logError("rail_revision_failed", error);

    return "";
  }
}
