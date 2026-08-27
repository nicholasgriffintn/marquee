import { parseAssistantMessage, type ChatMessage } from "../lib/curator-payload.ts";
import { logEvent } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { upstreamError } from "./upstream.ts";

export const AiGatewayError = upstreamError("AiGatewayError");

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

  if (!/^@cf\/[a-z0-9._/-]{1,120}$/u.test(env.AI_MODEL)) {
    throw new Error("Cloudflare AI model is invalid");
  }
}

export function fastModel(env: Bindings) {
  return /^@cf\/[a-z0-9._/-]{1,120}$/u.test(env.AI_FAST_MODEL ?? "")
    ? (env.AI_FAST_MODEL as string)
    : env.AI_MODEL;
}

const LAST_RESORT_MODEL = "@cf/openai/gpt-oss-120b";

function fallbackChain(env: Bindings, model: string) {
  return [...new Set([model, fastModel(env), env.AI_MODEL, LAST_RESORT_MODEL])];
}

function isRetryable(error: unknown) {
  return (
    error instanceof AiGatewayError &&
    (error.status === 429 || error.status === 500 || error.status >= 502)
  );
}

export async function requestAiCompletion(
  env: Bindings,
  messages: ChatMessage[],
  tools: ChatCompletionTool[],
  allowTools: boolean,
  options: {
    model?: string;
    timeoutMs?: number;
    maxTokens?: number;
    json?: boolean;
    toolChoice?: "auto" | "required" | "none";
    metadata?: Record<string, string>;
    cacheSeconds?: number;
  } = {},
) {
  assertConfiguration(env);

  const chain = fallbackChain(env, options.model ?? env.AI_MODEL);
  let lastError: unknown = new Error("Cloudflare AI produced no response");

  for (const candidate of chain) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      return await completeOnce(env, messages, tools, allowTools, options, candidate);
    } catch (error) {
      lastError = error;

      if (!isRetryable(error)) {
        throw error;
      }

      logEvent("ai_model_fallback", {
        from: candidate,
        status: error instanceof AiGatewayError ? error.status : null,
      });
    }
  }

  throw lastError;
}

async function completeOnce(
  env: Bindings,
  messages: ChatMessage[],
  tools: ChatCompletionTool[],
  allowTools: boolean,
  options: {
    timeoutMs?: number;
    maxTokens?: number;
    json?: boolean;
    toolChoice?: "auto" | "required" | "none";
    metadata?: Record<string, string>;
    cacheSeconds?: number;
  },
  model: string,
) {
  const timeoutMs = options.timeoutMs ?? 16_000;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "cf-aig-collect-log": "true",
        "cf-aig-gateway-id": env.AI_GATEWAY_ID,
        "cf-aig-request-timeout": String(timeoutMs - 1_000),
        "cf-aig-skip-cache": "false",
        ...(options.cacheSeconds ? { "cf-aig-cache-ttl": String(options.cacheSeconds) } : {}),
        ...(options.metadata
          ? { "cf-aig-metadata": JSON.stringify(options.metadata).slice(0, 1_000) }
          : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_completion_tokens: options.maxTokens ?? 500,
        ...(tools.length
          ? {
              tools,
              tool_choice: allowTools ? (options.toolChoice ?? "auto") : "none",
              parallel_tool_calls: false,
            }
          : {}),
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

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

export async function* streamAiCompletion(env: Bindings, messages: ChatMessage[]) {
  assertConfiguration(env);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "cf-aig-collect-log": "false",
        "cf-aig-gateway-id": env.AI_GATEWAY_ID,
        "cf-aig-request-timeout": "30000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages,
        temperature: 0.4,
        max_completion_tokens: 400,
        stream: true,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok || !response.body) {
    throw new AiGatewayError(
      `Cloudflare AI stream failed with status ${response.status}`,
      response.status,
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
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
