import type { ModelCallSink } from "../lib/decisions.ts";

export type DecisionValue =
  | string
  | number
  | boolean
  | null
  | DecisionValue[]
  | { [key: string]: DecisionValue };

export type ChoiceQuestion = {
  type: "choice";
  instructions: DecisionValue;
  criteria: Record<string, DecisionValue>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: DecisionValue;
  criteria: DecisionValue[];
};

export type NoulQuestion = {
  type: "noul";
  instructions: DecisionValue;
  criteria?: { true?: DecisionValue; false?: DecisionValue };
};

export type DecisionQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type DecisionRequest = {
  state: DecisionValue;
  questions: Record<string, DecisionQuestion>;
};

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
};

export type NoulAnswer = { type: "noul"; noul: number };

export type DecisionAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type DecisionResult = {
  model: string;
  answers: Record<string, DecisionAnswer>;
  usage: { inputTokens: number; outputTokens: number };
};

export type DecisionModelOptions = {
  record?: ModelCallSink;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export interface DecisionModel {
  evaluate(request: DecisionRequest, options?: DecisionModelOptions): Promise<DecisionResult>;
}

export function choiceAnswer(answer: DecisionAnswer | undefined): ChoiceAnswer | null {
  return answer?.type === "choice" ? answer : null;
}
