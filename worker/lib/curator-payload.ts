import type { CuratorResult } from "../types.ts";
import { isKnownTitle } from "./validation.ts";
import { isRecord } from "./values.ts";

export type { AssistantMessage, ChatMessage, ToolCall } from "./ai-completion-payload.ts";

function parseSummary(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 400)
    : "A grounded selection from your Marquee catalogue.";
}

function parseReasons(value: unknown, titleIds: string[]) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    titleIds.flatMap((titleId): Array<[string, string]> => {
      const reason = value[titleId];

      return typeof reason === "string" && reason.trim()
        ? [[titleId, reason.trim().slice(0, 240)]]
        : [];
    }),
  );
}

export function parseCuratorResult(
  content: string,
  availableIds: Set<string>,
): CuratorResult | null {
  try {
    const json = content.match(/\{[\s\S]*\}/u)?.[0];

    if (!json) {
      return null;
    }

    const parsed: unknown = JSON.parse(json);

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
  } catch {
    return null;
  }
}
