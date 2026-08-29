import type { ModelTier } from "../ai/policy.ts";
import type { OutputSchema } from "../ai/schemas.ts";
import { parseAssistantMessage, type ChatMessage } from "../lib/curator-payload.ts";
import { logEvent } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { upstreamError } from "./upstream.ts";

export const AiGatewayError = upstreamError("AiGatewayError");

const MODEL_PATTERN = /^@cf\/[a-z0-9._/-]{1,120}$/u;
const LAST_RESORT_MODEL = "@cf/openai/gpt-oss-120b";
const METADATA_LIMIT = 1_000;
const TIMEOUT_HEADROOM_MS = 1_000;

export type AiCall = {
  messages: ChatMessage[];
  tier: ModelTier;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  collectLog: boolean;
  cacheSeconds: number;
  metadata: Record<string, string>;
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "required" | "none";
  schema?: OutputSchema | null;
};

function assertConfiguration(env: Bindings) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Cloudflare AI authentication is not configured");
  }

  if (!/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID)) {
    throw new Error("Cloudflare account ID is not configured");
  }

  if (!/^[a-z0-9-]{1,64}$/u.test(env.AI_GATEWAY_ID)) {
    throw new Error("Cloudflare AI Gateway ID is invalid");
  }

  if (!MODEL_PATTERN.test(env.AI_MODEL)) {
    throw new Error("Cloudflare AI model is invalid");
  }
}

function fastModel(env: Bindings) {
  return MODEL_PATTERN.test(env.AI_FAST_MODEL ?? "") ? (env.AI_FAST_MODEL as string) : env.AI_MODEL;
}

export function modelChain(env: Bindings, tier: ModelTier) {
  const preferred = tier === "fast" ? fastModel(env) : env.AI_MODEL;

  return [...new Set([preferred, fastModel(env), env.AI_MODEL, LAST_RESORT_MODEL])];
}

function isRetryable(error: unknown) {
  return (
    error instanceof AiGatewayError &&
    (error.status === 429 || error.status === 500 || error.status >= 502)
  );
}

function isSchemaRejection(error: unknown) {
  return error instanceof AiGatewayError && (error.status === 400 || error.status === 422);
}

function privacyHeaders(call: AiCall) {
  return {
    "cf-aig-collect-log": call.collectLog ? "true" : "false",
    "cf-aig-skip-cache": call.cacheSeconds > 0 ? "false" : "true",
    ...(call.cacheSeconds > 0 ? { "cf-aig-cache-ttl": String(call.cacheSeconds) } : {}),
    "cf-aig-metadata": JSON.stringify(call.metadata).slice(0, METADATA_LIMIT),
  };
}

function completionsUrl(env: Bindings) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
}

export async function requestAiCompletion(env: Bindings, call: AiCall) {
  assertConfiguration(env);

  let schema = call.schema ?? null;
  let lastError: unknown = new Error("Cloudflare AI produced no response");

  for (const model of modelChain(env, call.tier)) {
    let attempt = true;

    while (attempt) {
      attempt = false;

      try {
        // oxlint-disable-next-line no-await-in-loop
        return await completeOnce(env, call, model, schema);
      } catch (error) {
        lastError = error;

        if (schema && isSchemaRejection(error)) {
          logEvent("ai_schema_unsupported", { model, schema: schema.name });
          schema = null;
          attempt = true;
          continue;
        }

        if (!isRetryable(error)) {
          throw error;
        }

        logEvent("ai_model_fallback", {
          from: model,
          status: error instanceof AiGatewayError ? error.status : null,
        });
      }
    }
  }

  throw lastError;
}

function responseFormat(schema: OutputSchema | null, hasSchemaPolicy: boolean) {
  if (schema) {
    return { response_format: { type: "json_schema", json_schema: schema.schema } };
  }

  return hasSchemaPolicy ? { response_format: { type: "json_object" } } : {};
}

async function completeOnce(
  env: Bindings,
  call: AiCall,
  model: string,
  schema: OutputSchema | null,
) {
  const tools = call.tools ?? [];
  const response = await fetch(completionsUrl(env), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "cf-aig-gateway-id": env.AI_GATEWAY_ID,
      "cf-aig-request-timeout": String(call.timeoutMs - TIMEOUT_HEADROOM_MS),
      ...privacyHeaders(call),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: call.messages,
      temperature: call.temperature,
      max_completion_tokens: call.maxTokens,
      ...(tools.length
        ? { tools, tool_choice: call.toolChoice ?? "auto", parallel_tool_calls: false }
        : {}),
      ...responseFormat(schema, Boolean(call.schema)),
    }),
    signal: AbortSignal.timeout(call.timeoutMs),
  });

  if (!response.ok) {
    throw new AiGatewayError(
      `Cloudflare AI Gateway request failed with status ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    throw new AiGatewayError(
      `Cloudflare AI returned a body that is not JSON (model: ${model}, ${String(error)})`,
      502,
    );
  }

  const message = parseAssistantMessage(payload);

  if (!message) {
    throw new AiGatewayError(`Cloudflare AI returned an invalid response (model: ${model})`, 502);
  }

  if (!message.content && !message.tool_calls?.length) {
    throw new AiGatewayError(
      `Cloudflare AI returned no content (finish_reason: ${finishReason(payload) ?? "unknown"}, model: ${model})`,
      502,
    );
  }

  return message;
}

export async function* streamAiCompletion(env: Bindings, call: AiCall) {
  assertConfiguration(env);

  const [model] = modelChain(env, call.tier);
  const response = await fetch(completionsUrl(env), {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "cf-aig-gateway-id": env.AI_GATEWAY_ID,
      "cf-aig-request-timeout": String(call.timeoutMs),
      ...privacyHeaders(call),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: call.messages,
      temperature: call.temperature,
      max_completion_tokens: call.maxTokens,
      stream: true,
    }),
    signal: AbortSignal.timeout(call.timeoutMs),
  });

  if (!response.ok || !response.body) {
    throw new AiGatewayError(
      `Cloudflare AI stream failed with status ${response.status}`,
      response.status,
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- reads one stream reader sequentially, chunks arrive in order
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += value;

    const lines = buffer.split("\n");

    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();

      if (!data || data === "[DONE]") {
        continue;
      }

      const delta = parseStreamDelta(data);

      if (delta) {
        yield delta;
      }
    }
  }
}

function parseStreamDelta(data: string) {
  try {
    const parsed: unknown = JSON.parse(data);

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return null;
    }

    const choice = parsed.choices[0];

    if (!isRecord(choice) || !isRecord(choice.delta)) {
      return null;
    }

    return typeof choice.delta.content === "string" ? choice.delta.content : null;
  } catch {
    return null;
  }
}

function finishReason(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const choice = payload.choices[0];

  return isRecord(choice) && typeof choice.finish_reason === "string" ? choice.finish_reason : null;
}
