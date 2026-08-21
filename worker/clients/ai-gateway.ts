import { parseAssistantMessage, type ChatMessage } from "../lib/curator-payload.ts";
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
    throw new Error(`Cloudflare AI Gateway request failed with status ${response.status}`);
  }

  const message = parseAssistantMessage(await response.json());

  if (!message) {
    throw new Error("Cloudflare AI returned an invalid response");
  }

  return message;
}
