import { requestAiCompletion, streamAiCompletion } from "../clients/ai-gateway.ts";
import type { ChatMessage } from "../lib/curator-payload.ts";
import type { ModelCallSink } from "../lib/decisions.ts";
import { parseJsonContent } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { type AiFeature, policyFor } from "./policy.ts";

const ATTRIBUTE_LIMIT = 40;

export type AiRun = {
  feature: AiFeature;
  decisionId: string;
  messages: ChatMessage[];
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "required" | "none";
  attributes?: Record<string, string | number>;
  record?: ModelCallSink;
};

function callFor(run: AiRun) {
  const policy = policyFor(run.feature);
  const attributes = Object.entries(run.attributes ?? {}).map(
    ([key, value]) => [key, String(value).slice(0, ATTRIBUTE_LIMIT)] as const,
  );

  return {
    messages: run.messages,
    tier: policy.tier,
    timeoutMs: policy.timeoutMs,
    maxTokens: policy.maxTokens,
    temperature: policy.temperature,
    collectLog: policy.collectLog,
    cache: policy.cache,
    metadata: Object.fromEntries([
      ["feature", run.feature],
      ["decision", run.decisionId],
      ...attributes,
    ]),
    schema: policy.schema,
    ...(run.record ? { record: run.record } : {}),
  };
}

export function runAiMessage(env: Bindings, run: AiRun) {
  return requestAiCompletion(env, {
    ...callFor(run),
    schema: null,
    ...(run.tools?.length ? { tools: run.tools, toolChoice: run.toolChoice ?? "auto" } : {}),
  });
}

export async function runAiObject(env: Bindings, run: AiRun): Promise<unknown> {
  const call = callFor(run);

  if (!call.schema) {
    throw new Error(`No output schema is declared for the ${run.feature} feature`);
  }

  const message = await requestAiCompletion(env, call);

  return parseJsonContent(message.content);
}

export function runAiStream(env: Bindings, run: AiRun) {
  return streamAiCompletion(env, { ...callFor(run), schema: null });
}
