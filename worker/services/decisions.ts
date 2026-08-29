import {
  estimatedCost,
  type DecisionCandidate,
  type DecisionDraft,
  type DecisionFeature,
  type DecisionOutcome,
  type ModelCallSink,
} from "../lib/decisions.ts";
import { logEvent } from "../lib/logging.ts";
import { writeDecision } from "../repositories/decisions.ts";
import type { Bindings } from "../types.ts";

export type Decision = ModelCallSink & {
  id: string;
  candidates(candidates: DecisionCandidate[]): void;
  select(titleIds: string[]): void;
  draft(): DecisionDraft;
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
  const draft: DecisionDraft = {
    id: crypto.randomUUID(),
    feature: input.feature,
    surface: input.surface ?? "",
    promptVersion: input.promptVersion ?? "",
    viewerId: input.viewerId ?? "",
    candidates: [],
    selected: [],
    calls: [],
  };
  let settled = false;

  return {
    id: draft.id,
    candidates(next) {
      draft.candidates.push(...next);
    },
    select(titleIds) {
      draft.selected = titleIds;
    },
    modelCall(call) {
      draft.calls.push(call);
    },
    draft() {
      return { ...draft };
    },
    async settle(outcome) {
      if (settled) {
        return;
      }

      settled = true;

      await settleDecision(env, draft, outcome);
    },
  };
}

export async function settleDecision(
  env: Bindings,
  draft: DecisionDraft,
  outcome: DecisionOutcome,
) {
  const served = draft.calls.filter((call) => !call.failed);
  const chosen = served.at(-1);

  await writeDecision(env.DB, {
    id: draft.id,
    viewerId: draft.viewerId,
    feature: draft.feature,
    surface: draft.surface,
    promptVersion: draft.promptVersion,
    model: chosen?.model ?? "",
    fallbackFrom: [...new Set(draft.calls.filter((call) => call.failed).map((call) => call.model))],
    candidates: draft.candidates,
    selected: draft.selected,
    latencyMs: draft.calls.reduce((total, call) => total + call.latencyMs, 0),
    inputTokens: served.reduce((total, call) => total + (call.inputTokens ?? 0), 0),
    outputTokens: served.reduce((total, call) => total + (call.outputTokens ?? 0), 0),
    costUsd: estimatedCost(served),
    outcome,
  });

  logEvent("decision_settled", {
    decisionId: draft.id,
    feature: draft.feature,
    outcome,
    candidates: draft.candidates.length,
    selected: draft.selected.length,
    model: chosen?.model ?? "",
  });
}
