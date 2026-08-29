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

export async function writeDecision(db: D1Database, record: DecisionRecord) {
  const candidates = packCandidates(record.candidates);

  try {
    await db
      .prepare(
        `INSERT INTO decisions (
           id, viewer_id, feature, surface, prompt_version, model, fallback_from,
           candidates, candidate_count, selected, latency_ms, input_tokens, output_tokens,
           cost_usd, outcome, expires_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
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
      )
      .bind(
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
      )
      .run();
  } catch (error) {
    logError("decision_write_failed", error, { feature: record.feature });
  }
}

export async function pruneDecisions(db: D1Database) {
  try {
    await db.prepare(`DELETE FROM decisions WHERE julianday(expires_at) <= julianday('now')`).run();
  } catch (error) {
    logError("decision_prune_failed", error);
  }
}
