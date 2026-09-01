import { modelOptions } from "../ai/model-options.ts";
import type { AiModelCandidate, AiRoute } from "../ai/model-routing.ts";
import type { CachePolicy } from "../ai/policy.ts";
import type { OutputSchema } from "../ai/schemas.ts";
import { parseAssistantMessage, parseUsage, type ChatMessage } from "../lib/curator-payload.ts";
import type { ModelCallSink } from "../lib/decisions.ts";
import { sha256Hex } from "../lib/hash.ts";
import { logEvent } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { UpstreamError } from "./upstream.ts";

export class AiGatewayError extends UpstreamError {
  constructor(
    message: string,
    status = 502,
    readonly transport: AiRoute["transport"] = "cloudflare",
  ) {
    super(message, status);
    this.name = "AiGatewayError";
  }
}

const METADATA_LIMIT = 1_000;
const TIMEOUT_HEADROOM_MS = 1_000;

export type AiCall = {
  messages: ChatMessage[];
  route: AiRoute;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  collectLog: boolean;
  cache: CachePolicy;
  metadata: Record<string, string>;
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "required" | "none";
  schema?: OutputSchema | null;
  record?: ModelCallSink;
};

function assertConfiguration(env: Bindings) {
  if (!env.AI_GATEWAY_TOKEN) {
    throw new Error("Cloudflare AI authentication is not configured");
  }

  if (!/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID)) {
    throw new Error("Cloudflare account ID is not configured");
  }

  if (!/^[a-z0-9-]{1,64}$/u.test(env.AI_GATEWAY_ID)) {
    throw new Error("Cloudflare AI Gateway ID is invalid");
  }
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

function cacheScope(route: AiRoute) {
  return route.transport === "byok" ? `byok:${route.provider}:${route.byokAlias}` : "cloudflare";
}

async function gatewayHeaders(call: AiCall, body: string) {
  return {
    "cf-aig-collect-log": call.collectLog ? "true" : "false",
    "cf-aig-skip-cache": call.cache.enabled ? "false" : "true",
    ...(call.cache.enabled
      ? { "cf-aig-cache-key": `marquee-v1-${await sha256Hex(`${cacheScope(call.route)}:${body}`)}` }
      : {}),
    ...(call.cache.ttlSeconds ? { "cf-aig-cache-ttl": String(call.cache.ttlSeconds) } : {}),
    "cf-aig-metadata": JSON.stringify(call.metadata).slice(0, METADATA_LIMIT),
  };
}

function completionsUrl(env: Bindings, route: AiRoute) {
  return route.transport === "byok"
    ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${route.providerPath}`
    : `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
}

function authenticationHeaders(env: Bindings, route: AiRoute): Record<string, string> {
  if (route.transport === "byok") {
    return {
      "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}`,
      "cf-aig-byok-alias": route.byokAlias,
    };
  }

  return {
    authorization: `Bearer ${env.AI_GATEWAY_TOKEN}`,
    "cf-aig-gateway-id": env.AI_GATEWAY_ID,
  };
}

export async function requestAiCompletion(env: Bindings, call: AiCall) {
  assertConfiguration(env);

  let schema = call.schema ?? null;
  let lastError: unknown = new Error("Cloudflare AI produced no response");

  for (const [index, model] of call.route.candidates.entries()) {
    let attempt = true;

    while (attempt) {
      attempt = false;

      try {
        // oxlint-disable-next-line no-await-in-loop
        return await completeOnce(env, call, model, schema);
      } catch (error) {
        lastError = error;

        if (schema && isSchemaRejection(error)) {
          logEvent("ai_schema_unsupported", { model: model.recordedModel, schema: schema.name });
          schema = null;
          attempt = true;
          continue;
        }

        const retryable = isRetryable(error);

        if (call.route.transport === "byok") {
          logEvent("ai_byok_request_failed", {
            model: model.recordedModel,
            status: error instanceof AiGatewayError ? error.status : null,
          });
        }

        if (!retryable) {
          throw error;
        }

        if (call.route.transport === "cloudflare") {
          logEvent(
            index < call.route.candidates.length - 1 ? "ai_model_fallback" : "ai_model_exhausted",
            {
              model: model.recordedModel,
              status: error instanceof AiGatewayError ? error.status : null,
            },
          );
        }
      }
    }
  }

  throw lastError;
}

function responseFormat(schema: OutputSchema | null, hasSchemaPolicy: boolean) {
  if (schema) {
    return {
      response_format: {
        type: "json_schema",
        json_schema: { name: schema.name, schema: schema.schema },
      },
    };
  }

  return hasSchemaPolicy ? { response_format: { type: "json_object" } } : {};
}

function generationOptions(call: AiCall, model: AiModelCandidate) {
  const options = modelOptions(call.route, model);

  return {
    ...(options.supportsTemperature ? { temperature: call.temperature } : {}),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    ...(options.disableThinking ? { chat_template_kwargs: { thinking: false } } : {}),
  };
}

async function completeOnce(
  env: Bindings,
  call: AiCall,
  model: AiModelCandidate,
  schema: OutputSchema | null,
) {
  const tools = call.tools ?? [];
  const body = JSON.stringify({
    model: model.requestModel,
    messages: call.messages,
    max_completion_tokens: call.maxTokens,
    ...generationOptions(call, model),
    ...(tools.length
      ? { tools, tool_choice: call.toolChoice ?? "auto", parallel_tool_calls: false }
      : {}),
    ...responseFormat(schema, Boolean(call.schema)),
  });
  const startedAt = Date.now();
  const report = (usage: { inputTokens: number; outputTokens: number } | null) => {
    call.record?.modelCall({
      model: model.recordedModel,
      latencyMs: Date.now() - startedAt,
      ...usage,
      ...(usage ? {} : { failed: true }),
    });
  };

  const response = await fetchCompletion(
    completionsUrl(env, call.route),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        ...authenticationHeaders(env, call.route),
        "cf-aig-request-timeout": String(call.timeoutMs - TIMEOUT_HEADROOM_MS),
        ...(await gatewayHeaders(call, body)),
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(call.timeoutMs),
    },
    report,
  );

  if (!response.ok) {
    report(null);

    throw new AiGatewayError(
      `Cloudflare AI Gateway request failed with status ${response.status}`,
      response.status,
      call.route.transport,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    report(null);

    throw new AiGatewayError(
      `Cloudflare AI returned a body that is not JSON (model: ${model.recordedModel}, ${String(error)})`,
      502,
      call.route.transport,
    );
  }

  const message = parseAssistantMessage(payload);

  if (!message) {
    report(null);

    throw new AiGatewayError(
      `Cloudflare AI returned an invalid response (model: ${model.recordedModel})`,
      502,
      call.route.transport,
    );
  }

  if (!message.content && !message.tool_calls?.length) {
    report(null);

    throw new AiGatewayError(
      `Cloudflare AI returned no content (finish_reason: ${finishReason(payload) ?? "unknown"}, model: ${model.recordedModel})`,
      502,
      call.route.transport,
    );
  }

  report(parseUsage(payload));

  return message;
}

async function fetchCompletion(url: string, init: RequestInit, report: (usage: null) => void) {
  try {
    return await fetch(url, init);
  } catch (error) {
    report(null);

    throw error;
  }
}

export async function* streamAiCompletion(env: Bindings, call: AiCall) {
  assertConfiguration(env);

  const model = call.route.candidates[0];

  if (!model) {
    throw new Error("Cloudflare AI model route is empty");
  }

  const body = JSON.stringify({
    model: model.requestModel,
    messages: call.messages,
    max_completion_tokens: call.maxTokens,
    ...generationOptions(call, model),
    stream: true,
  });

  const response = await fetch(completionsUrl(env, call.route), {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      ...authenticationHeaders(env, call.route),
      "cf-aig-request-timeout": String(call.timeoutMs),
      ...(await gatewayHeaders(call, body)),
      "content-type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(call.timeoutMs),
  });

  if (!response.ok || !response.body) {
    throw new AiGatewayError(
      `Cloudflare AI stream failed with status ${response.status}`,
      response.status,
      call.route.transport,
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
