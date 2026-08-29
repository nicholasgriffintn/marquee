import {
  DECISION_RETENTION_DAYS,
  packCandidates,
  packSelected,
  type DecisionCandidate,
  type DecisionFeature,
  type DecisionOutcome,
} from "../lib/decisions.ts";
import { logError } from "../lib/logging.ts";

export type DecisionRecord = {
  id: string;
  viewerId: string;
  feature: DecisionFeature;
  surface: string;
  promptVersion: string;
  model: string;
  fallbackFrom: string[];
  candidates: DecisionCandidate[];
  selected: string[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  outcome: DecisionOutcome;
};

const SURFACE_LIMIT = 80;

function expiry() {
  return new Date(Date.now() + DECISION_RETENTION_DAYS * 86_400_000).toISOString();
}

export async function writeDecision(db: Database, record: DecisionRecord) {
  const candidates = packCandidates(record.candidates);

  try {
    await db.execute(
      `INSERT INTO decisions (
           id, viewer_id, feature, surface, prompt_version, model, fallback_from,
           candidates, candidate_count, selected, latency_ms, input_tokens, output_tokens,
           cost_usd, outcome, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT(id) DO UPDATE SET
           model = excluded.model,
           fallback_from = excluded.fallback_from,
           candidates = excluded.candidates,
           candidate_count = excluded.candidate_count,
           selected = excluded.selected,
           latency_ms = excluded.latency_ms,
           input_tokens = excluded.input_tokens,
           output_tokens = excluded.output_tokens,
           cost_usd = excluded.cost_usd,
           outcome = excluded.outcome`,
      [
        record.id,
        record.viewerId || null,
        record.feature,
        record.surface.slice(0, SURFACE_LIMIT),
        record.promptVersion,
        record.model,
        JSON.stringify(record.fallbackFrom),
        JSON.stringify(candidates),
        record.candidates.length,
        JSON.stringify(packSelected(record.selected)),
        Math.round(record.latencyMs),
        record.inputTokens,
        record.outputTokens,
        record.costUsd,
        record.outcome,
        expiry(),
      ],
    );
  } catch (error) {
    logError("decision_write_failed", error, { feature: record.feature });
  }
}

export async function pruneDecisions(db: Database) {
  try {
    await db.execute(
      `DELETE FROM decisions WHERE (EXTRACT(EPOCH FROM expires_at) / 86400.0) <= (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400.0)`,
    );
  } catch (error) {
    logError("decision_prune_failed", error);
  }
}

export type DecisionBoardRow = {
  feature: DecisionFeature;
  decisions: number;
  served: number;
  barren: number;
  failed: number;
  fellBack: number;
  candidates: number;
  latencyMs: number;
  costUsd: number;
  followed: number;
  refused: number;
};

export async function readDecisionBoard(db: Database, days = 28): Promise<DecisionBoardRow[]> {
  try {
    const rows = await db.query<DecisionBoardRow>(
      `SELECT d.feature,
                count(*) AS decisions,
                count(*) FILTER (WHERE d.outcome = 'served') AS served,
                count(*) FILTER (WHERE d.outcome = 'empty') AS barren,
                count(*) FILTER (WHERE d.outcome = 'failed') AS failed,
                count(*) FILTER (WHERE d.fallback_from <> '[]') AS "fellBack",
                COALESCE(avg(d.candidate_count), 0)::double precision AS candidates,
                COALESCE(avg(d.latency_ms), 0)::double precision AS "latencyMs",
                COALESCE(sum(d.cost_usd), 0) AS "costUsd",
                count(*) FILTER (WHERE outcomes.followed) AS followed,
                count(*) FILTER (WHERE outcomes.refused) AS refused
           FROM decisions AS d
           LEFT JOIN LATERAL (
             SELECT bool_or(s.type IN ('provider_exit', 'watched')) AS followed,
                    bool_or(s.type IN ('rejection', 'never')) AS refused
               FROM viewer_signals AS s
              WHERE s.decision_id = d.id
           ) AS outcomes ON true
          WHERE d.created_at > (CURRENT_TIMESTAMP - CAST($1 AS INTERVAL))
          GROUP BY d.feature
          ORDER BY decisions DESC`,
      [`${Math.max(1, Math.trunc(days))} days`],
    );

    return rows.rows;
  } catch (error) {
    logError("decision_board_read_failed", error);

    return [];
  }
}
