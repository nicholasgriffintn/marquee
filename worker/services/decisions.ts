import {
  estimatedCost,
  modelRates,
  type DecisionCandidate,
  type DecisionFeature,
  type DecisionOutcome,
  type ModelCall,
  type ModelCallSink,
} from "../lib/decisions.ts";
import { logEvent } from "../lib/logging.ts";
import { writeDecision } from "../repositories/decisions.ts";
import type { Bindings } from "../types.ts";

export type Decision = ModelCallSink & {
  id: string;
  candidates(candidates: DecisionCandidate[]): void;
  select(titleIds: string[]): void;
  settle(outcome: DecisionOutcome): Promise<void>;
};

export function beginDecision(
  env: Bindings,
  input: {
    feature: DecisionFeature;
    promptVersion?: string;
    viewerId?: string;
    surface?: string;
  },
): Decision {
  const id = crypto.randomUUID();
  const candidates: DecisionCandidate[] = [];
  const calls: ModelCall[] = [];
  let selected: string[] = [];
  let settled = false;

  return {
    id,
    candidates(next) {
      candidates.push(...next);
    },
    select(titleIds) {
      selected = titleIds;
    },
    modelCall(call) {
      calls.push(call);
    },
    async settle(outcome) {
      if (settled) {
        return;
      }

      settled = true;

      const served = calls.filter((call) => !call.failed);
      const chosen = served.at(-1);

      await writeDecision(env.DB, {
        id,
        viewerId: input.viewerId ?? "",
        feature: input.feature,
        surface: input.surface ?? "",
        promptVersion: input.promptVersion ?? "",
        model: chosen?.model ?? "",
        fallbackFrom: [...new Set(calls.filter((call) => call.failed).map((call) => call.model))],
        candidates,
        selected,
        latencyMs: calls.reduce((total, call) => total + call.latencyMs, 0),
        inputTokens: served.reduce((total, call) => total + (call.inputTokens ?? 0), 0),
        outputTokens: served.reduce((total, call) => total + (call.outputTokens ?? 0), 0),
        costUsd: estimatedCost(served, modelRates(env)),
        outcome,
      });

      logEvent("decision_settled", {
        decisionId: id,
        feature: input.feature,
        outcome,
        candidates: candidates.length,
        selected: selected.length,
        model: chosen?.model ?? "",
      });
    },
  };
}
