import type { MediaTitle } from "../../src/domain/catalog.ts";
import { choiceAnswer, type DecisionValue } from "../decisions/model.ts";
import { configuredDecisionModel } from "../decisions/runtime.ts";
import type { ModelCallSink } from "../lib/decisions.ts";
import { logEvent } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";

const OVERVIEW_LIMIT = 360;
const KEYWORD_LIMIT = 10;

export type TitleDecisionRanking = {
  ids: string[];
  scores: Map<string, number>;
  confidence: number;
  model: string;
};

function optionFor(title: MediaTitle, facts: string[]) {
  return {
    title: title.title,
    year: title.year,
    format: title.mediaType === "movie" ? "film" : "television series",
    runtime_minutes: title.runtimeMinutes,
    genres: title.genres.slice(0, 4),
    keywords: (title.keywords ?? []).slice(0, KEYWORD_LIMIT),
    overview: title.overview.slice(0, OVERVIEW_LIMIT),
    facts,
  };
}

export async function rankTitleDecisions(
  env: Bindings,
  input: {
    state: DecisionValue;
    instructions: DecisionValue;
    titles: MediaTitle[];
    facts?: Map<string, string[]>;
    record?: ModelCallSink;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<TitleDecisionRanking | null> {
  const model = configuredDecisionModel(env);

  if (!model || input.titles.length < 2) {
    return null;
  }

  const criteria = Object.fromEntries(
    input.titles.map((title) => [title.id, optionFor(title, input.facts?.get(title.id) ?? [])]),
  );
  const result = await model.evaluate(
    {
      state: input.state,
      questions: {
        ranking: {
          type: "choice",
          instructions: input.instructions,
          criteria,
        },
      },
    },
    {
      ...(input.record ? { record: input.record } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    },
  );
  const answer = choiceAnswer(result.answers.ranking);

  if (!answer) {
    return null;
  }

  const order = new Map(input.titles.map((title, index) => [title.id, index]));
  const scores = new Map(
    input.titles.map((title) => [title.id, answer.probabilities[title.id] ?? 0]),
  );
  const ids = input.titles
    .map((title) => title.id)
    .toSorted((left, right) => {
      const difference = (scores.get(right) ?? 0) - (scores.get(left) ?? 0);

      return difference || (order.get(left) ?? 0) - (order.get(right) ?? 0);
    });

  logEvent("title_decision_ranked", {
    model: result.model,
    candidates: ids.length,
    confidence: answer.confidence,
  });

  return { ids, scores, confidence: answer.confidence, model: result.model };
}
