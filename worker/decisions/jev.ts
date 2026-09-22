import { UpstreamError } from "../clients/upstream.ts";
import { traceUpstream } from "../lib/upstream-usage.ts";
import { isRecord } from "../lib/values.ts";
import type {
  ChoiceAnswer,
  DecisionAnswer,
  DecisionModel,
  DecisionModelOptions,
  DecisionQuestion,
  DecisionRequest,
  DecisionResult,
  NoulAnswer,
  ScoreAnswer,
} from "./model.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 3_500;
const MAX_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;
const MAX_RETRY_DELAY_MS = 750;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

export class JevError extends UpstreamError {
  constructor(message: string, status = 502) {
    super(message, status);
    this.name = "JevError";
  }
}

type JevConfiguration = {
  apiKey: string;
  model?: string;
};

function probability(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function probabilities(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const parsed: Record<string, number> = {};

  for (const [key, candidate] of Object.entries(value)) {
    const number = probability(candidate);

    if (number === null) {
      return null;
    }

    parsed[key] = number;
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function choice(value: Record<string, unknown>, question: DecisionQuestion): ChoiceAnswer | null {
  const distribution = probabilities(value.probabilities);
  const confidence = probability(value.confidence);
  const selected = typeof value.choice === "string" ? value.choice : null;
  const options = question.type === "choice" ? Object.keys(question.criteria) : [];

  return selected &&
    distribution &&
    confidence !== null &&
    options.length === Object.keys(distribution).length &&
    options.every((option) => Object.hasOwn(distribution, option)) &&
    Object.hasOwn(distribution, selected)
    ? { type: "choice", choice: selected, confidence, probabilities: distribution }
    : null;
}

function legend(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const parsed: Record<string, string> = {};

  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string") {
      return null;
    }

    parsed[key] = candidate;
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function score(value: Record<string, unknown>): ScoreAnswer | null {
  const distribution = probabilities(value.probabilities);
  const scale = legend(value.legend);
  const confidence = probability(value.confidence);

  return typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    distribution &&
    scale &&
    confidence !== null
    ? {
        type: "score",
        score: value.score,
        confidence,
        legend: scale,
        probabilities: distribution,
      }
    : null;
}

function noul(value: Record<string, unknown>): NoulAnswer | null {
  const answer = probability(value.noul);

  return answer === null ? null : { type: "noul", noul: answer };
}

function answerFor(value: unknown, question: DecisionQuestion): DecisionAnswer | null {
  if (!isRecord(value) || value.type !== question.type) {
    return null;
  }

  if (question.type === "choice") {
    return choice(value, question);
  }

  return question.type === "score" ? score(value) : noul(value);
}

function usageFor(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const inputTokens = value.input_tokens;
  const outputTokens = value.output_tokens;

  return Number.isInteger(inputTokens) &&
    Number(inputTokens) >= 0 &&
    Number.isInteger(outputTokens) &&
    Number(outputTokens) >= 0
    ? { inputTokens: Number(inputTokens), outputTokens: Number(outputTokens) }
    : null;
}

function resultFor(value: unknown, request: DecisionRequest): DecisionResult | null {
  if (!isRecord(value) || typeof value.model !== "string" || !isRecord(value.answers)) {
    return null;
  }

  const usage = usageFor(value.usage);

  if (!usage) {
    return null;
  }

  const answers: Record<string, DecisionAnswer> = {};

  for (const [key, question] of Object.entries(request.questions)) {
    const answer = answerFor(value.answers[key], question);

    if (!answer) {
      return null;
    }

    answers[key] = answer;
  }

  return { model: value.model, answers, usage };
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  const suggested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 150 * attempt;

  return Math.min(suggested, MAX_RETRY_DELAY_MS);
}

function requestSignal(deadline: number, signal?: AbortSignal) {
  const remaining = Math.max(1, deadline - Date.now());
  const timeout = AbortSignal.timeout(remaining);

  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export class JevDecisionModel implements DecisionModel {
  readonly #apiKey: string;
  readonly model: string;

  constructor(configuration: JevConfiguration) {
    this.#apiKey = configuration.apiKey.trim();
    this.model = configuration.model?.trim() || DEFAULT_MODEL;

    if (!this.#apiKey) {
      throw new Error("TypeSafe authentication is not configured");
    }
  }

  async evaluate(
    request: DecisionRequest,
    options: DecisionModelOptions = {},
  ): Promise<DecisionResult> {
    if (Object.keys(request.questions).length === 0) {
      throw new Error("A decision request needs at least one question");
    }

    const body = JSON.stringify({ ...request, model: this.model });
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1),
      MAX_TIMEOUT_MS,
    );
    const deadline = Date.now() + timeoutMs;

    return this.#attempt(request, body, options, deadline, 1);
  }

  async #attempt(
    request: DecisionRequest,
    body: string,
    options: DecisionModelOptions,
    deadline: number,
    attempt: number,
  ): Promise<DecisionResult> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await traceUpstream("typesafe", () =>
        fetch(ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.#apiKey}`,
            "content-type": "application/json",
          },
          body,
          signal: requestSignal(deadline, options.signal),
        }),
      );
    } catch (error) {
      options.record?.modelCall({
        model: this.model,
        latencyMs: Date.now() - startedAt,
        failed: true,
      });

      if (options.signal?.aborted || attempt === MAX_ATTEMPTS || Date.now() >= deadline) {
        throw error;
      }

      return this.#attempt(request, body, options, deadline, attempt + 1);
    }

    if (!response.ok) {
      options.record?.modelCall({
        model: this.model,
        latencyMs: Date.now() - startedAt,
        failed: true,
      });

      const error = new JevError(
        `TypeSafe request failed with status ${response.status}`,
        response.status,
      );

      if (
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt === MAX_ATTEMPTS ||
        Date.now() >= deadline
      ) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));

      return this.#attempt(request, body, options, deadline, attempt + 1);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      options.record?.modelCall({
        model: this.model,
        latencyMs: Date.now() - startedAt,
        failed: true,
      });
      throw new JevError("TypeSafe returned a non-JSON decision response");
    }

    const parsed = resultFor(payload, request);

    if (!parsed) {
      options.record?.modelCall({
        model: this.model,
        latencyMs: Date.now() - startedAt,
        failed: true,
      });
      throw new JevError("TypeSafe returned an invalid decision response");
    }

    options.record?.modelCall({
      model: parsed.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: parsed.usage.inputTokens,
      outputTokens: parsed.usage.outputTokens,
    });

    return parsed;
  }
}
