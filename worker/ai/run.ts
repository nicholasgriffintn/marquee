import { requestAiCompletion, streamAiCompletion } from "../clients/ai-gateway.ts";
import type { ChatMessage } from "../lib/curator-payload.ts";
import type { ModelCallSink } from "../lib/decisions.ts";
import { parseJsonContent } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { resolveAiRoute } from "./model-routing.ts";
import { type AiFeature, policyFor } from "./policy.ts";

const ATTRIBUTE_LIMIT = 40;

export type AiRun = {
  feature: AiFeature;
  decisionId: string;
  viewerId: string | null;
  messages: ChatMessage[];
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "required" | "none";
  attributes?: Record<string, string | number>;
  record?: ModelCallSink;
  signal?: AbortSignal;
};

async function callFor(env: Bindings, run: AiRun) {
  const policy = policyFor(run.feature);
  const route = await resolveAiRoute(env, run.viewerId, policy.tier);
  const attributes = Object.entries(run.attributes ?? {}).map(
    ([key, value]) => [key, String(value).slice(0, ATTRIBUTE_LIMIT)] as const,
  );

  return {
    messages: run.messages,
    route,
    timeoutMs: policy.timeoutMs,
    maxTokens: policy.maxTokens,
    temperature: policy.temperature,
    collectLog: policy.collectLog,
    cache: policy.cache,
    metadata: Object.fromEntries([
      ["feature", run.feature],
      ["decision", run.decisionId],
      ["route", `${route.source}-${route.transport}`],
      ...attributes,
    ]),
    schema: policy.schema,
    ...(run.record ? { record: run.record } : {}),
    ...(run.signal ? { signal: run.signal } : {}),
  };
}

export async function runAiMessage(env: Bindings, run: AiRun) {
  return requestAiCompletion(env, {
    ...(await callFor(env, run)),
    schema: null,
    ...(run.tools?.length ? { tools: run.tools, toolChoice: run.toolChoice ?? "auto" } : {}),
  });
}

export async function runAiObject(env: Bindings, run: AiRun): Promise<unknown> {
  const call = await callFor(env, run);

  if (!call.schema) {
    throw new Error(`No output schema is declared for the ${run.feature} feature`);
  }

  const message = await requestAiCompletion(env, call);

  return parseJsonContent(message.content);
}

export async function* runAiStream(env: Bindings, run: AiRun) {
  yield* streamAiCompletion(env, { ...(await callFor(env, run)), schema: null });
}
