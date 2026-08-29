import type { Bindings } from "../types.ts";
import { isRecord, numberAt, parseJson } from "./values.ts";

export type DecisionFeature =
  | "curator"
  | "rails"
  | "usher_pick"
  | "usher_order"
  | "digest"
  | "insight";

export type DecisionOutcome = "served" | "empty" | "failed";

export type DecisionCandidate = { titleId: string; score?: number; origin?: string };

export type ModelCall = {
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  failed?: boolean;
};

export type ModelCallSink = { modelCall(call: ModelCall): void };

export type ModelRate = { input: number; output: number };

export type ModelRates = Record<string, ModelRate>;

export const DECISION_RETENTION_DAYS = 90;

const CANDIDATE_LIMIT = 60;
const SELECTED_LIMIT = 24;
const SCORE_PRECISION = 4;

const DECISION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function isDecisionId(value: unknown): value is string {
  return typeof value === "string" && DECISION_ID.test(value);
}

export function promptVersion(...parts: string[]) {
  let hash = 0x81_1c_9d_c5;

  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 0x01_00_01_93);
    }
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function candidatesFrom(
  titles: { id: string }[],
  options: { scores?: Map<string, number>; origin?: string } = {},
): DecisionCandidate[] {
  return titles.map((title) => {
    const score = options.scores?.get(title.id);

    return {
      titleId: title.id,
      ...(typeof score === "number" && Number.isFinite(score) ? { score } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    };
  });
}

export function packCandidates(candidates: DecisionCandidate[]) {
  const seen = new Set<string>();
  const kept: DecisionCandidate[] = [];

  for (const candidate of candidates) {
    if (kept.length >= CANDIDATE_LIMIT || seen.has(candidate.titleId)) {
      continue;
    }

    seen.add(candidate.titleId);
    kept.push({
      titleId: candidate.titleId,
      ...(typeof candidate.score === "number" && Number.isFinite(candidate.score)
        ? { score: Number(candidate.score.toFixed(SCORE_PRECISION)) }
        : {}),
      ...(candidate.origin ? { origin: candidate.origin.slice(0, 24) } : {}),
    });
  }

  return kept;
}

export function packSelected(titleIds: string[]) {
  return [...new Set(titleIds)].slice(0, SELECTED_LIMIT);
}

export function modelRates(env: Bindings): ModelRates {
  const parsed = parseJson(env.AI_MODEL_RATES ?? "");

  if (!isRecord(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([model, rate]): Array<[string, ModelRate]> => {
      if (!isRecord(rate)) {
        return [];
      }

      const input = numberAt(rate, "input");
      const output = numberAt(rate, "output");

      return input === null || output === null ? [] : [[model, { input, output }]];
    }),
  );
}

export function estimatedCost(calls: ModelCall[], rates: ModelRates) {
  if (calls.length === 0) {
    return null;
  }

  let total = 0;

  for (const call of calls) {
    const rate = rates[call.model];

    if (!rate) {
      return null;
    }

    total +=
      ((call.inputTokens ?? 0) * rate.input + (call.outputTokens ?? 0) * rate.output) / 1_000_000;
  }

  return total;
}
