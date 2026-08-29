import type { CuratorResult } from "../types.ts";
import { isKnownTitle } from "./validation.ts";
import { isRecord, records } from "./values.ts";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; name: string; content: string };

function parseToolCall(value: unknown): ToolCall | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.function)) {
    return null;
  }

  const name = value.function.name;
  const argumentsValue = value.function.arguments;

  if (typeof name !== "string") {
    return null;
  }

  return {
    id: value.id,
    type: "function",
    function: {
      name,
      arguments:
        typeof argumentsValue === "string" ? argumentsValue : JSON.stringify(argumentsValue ?? {}),
    },
  };
}

function parseSummary(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 400)
    : "A grounded selection from your Marquee catalogue.";
}

function parseReasons(value: unknown, titleIds: string[]) {
  const allowed = new Set(titleIds);

  return Object.fromEntries(
    records(value).flatMap((entry): Array<[string, string]> => {
      const titleId = entry.titleId;
      const reason = entry.reason;

      return typeof titleId === "string" &&
        allowed.has(titleId) &&
        typeof reason === "string" &&
        reason.trim()
        ? [[titleId, reason.trim().slice(0, 240)]]
        : [];
    }),
  );
}

export function parseAssistantMessage(payload: unknown): AssistantMessage | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const choice = payload.choices[0];

  if (!isRecord(choice) || !isRecord(choice.message)) {
    return null;
  }

  const toolCalls = Array.isArray(choice.message.tool_calls)
    ? choice.message.tool_calls.flatMap((value) => {
        const call = parseToolCall(value);

        return call ? [call] : [];
      })
    : [];

  return {
    role: "assistant",
    content: typeof choice.message.content === "string" ? choice.message.content : null,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
}

export function parseUsage(payload: unknown) {
  const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : null;

  return {
    inputTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    outputTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}

export function parseCuratorResult(
  parsed: unknown,
  availableIds: Set<string>,
): CuratorResult | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.titleIds)) {
    return null;
  }

  const titleIds = [
    ...new Set(
      parsed.titleIds.filter(
        (id): id is string => typeof id === "string" && isKnownTitle(id) && availableIds.has(id),
      ),
    ),
  ].slice(0, 8);

  if (titleIds.length === 0) {
    return null;
  }

  return {
    titleIds,
    summary: parseSummary(parsed.summary),
    reasons: parseReasons(parsed.reasons, titleIds),
  };
}
