import { parseAssistantMessage, type ChatMessage } from "../lib/curator-payload.ts";
import { isRecord } from "../lib/values.ts";
import type { Bindings } from "../types.ts";

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

export class AiGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

export async function requestAiCompletion(
  env: Bindings,
  messages: ChatMessage[],
  tools: ChatCompletionTool[],
  allowTools: boolean,
) {
  assertConfiguration(env);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "cf-aig-collect-log": "false",
        "cf-aig-gateway-id": env.AI_GATEWAY_ID,
        "cf-aig-request-timeout": "15000",
        "cf-aig-skip-cache": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages,
        temperature: 0.2,
        max_completion_tokens: 500,
        tools,
        tool_choice: allowTools ? "auto" : "none",
        parallel_tool_calls: false,
      }),
      signal: AbortSignal.timeout(16_000),
    },
  );

  if (!response.ok) {
    throw new AiGatewayError(
      `Cloudflare AI Gateway request failed with status ${response.status}`,
      response.status,
    );
  }

  const message = parseAssistantMessage(await response.json());

  if (!message) {
    throw new Error("Cloudflare AI returned an invalid response");
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
