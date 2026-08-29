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

export type DecisionDraft = {
  id: string;
  feature: DecisionFeature;
  surface: string;
  promptVersion: string;
  viewerId: string;
  candidates: DecisionCandidate[];
  selected: string[];
  calls: ModelCall[];
};

export const DECISION_RETENTION_DAYS = 90;

const RATES_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 0.27, output: 0.85 },
  "@cf/moonshotai/kimi-k2.5": { input: 0.6, output: 3 },
  "@cf/moonshotai/kimi-k2.6": { input: 0.95, output: 4 },
  "@cf/moonshotai/kimi-k2.7-code": { input: 0.95, output: 4 },
  "@cf/openai/gpt-oss-120b": { input: 0.35, output: 0.75 },
};

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

export function estimatedCost(calls: ModelCall[]) {
  if (calls.length === 0) {
    return null;
  }

  let total = 0;

  for (const call of calls) {
    const rate = RATES_PER_MILLION_TOKENS[call.model];

    if (!rate) {
      return null;
    }

    total +=
      ((call.inputTokens ?? 0) * rate.input + (call.outputTokens ?? 0) * rate.output) / 1_000_000;
  }

  return total;
}
