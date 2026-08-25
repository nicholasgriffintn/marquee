import { isRecord } from "./values.ts";

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
