export type EvaluationVerdict = "pass" | "fail" | "skipped";

export type RelevanceResult = {
  id: string;
  query: string;
  mode: "keyword" | "hybrid";
  verdict: EvaluationVerdict;
  within: number;
  ranks: { titleId: string; rank: number | null }[];
  intruders: string[];
  note: string;
};

export type PolicyResult = {
  id: string;
  path: string;
  method: string;
  verdict: EvaluationVerdict;
  expected: string;
  actual: string;
};

export type EvaluationTally = { passed: number; failed: number; skipped: number };

export type EvaluationReport = {
  relevance: RelevanceResult[];
  policy: PolicyResult[];
  tally: EvaluationTally;
  meanReciprocalRank: number;
  ranAt: string;
};

export function tallyOf(verdicts: EvaluationVerdict[]): EvaluationTally {
  return {
    passed: verdicts.filter((verdict) => verdict === "pass").length,
    failed: verdicts.filter((verdict) => verdict === "fail").length,
    skipped: verdicts.filter((verdict) => verdict === "skipped").length,
  };
}
