import type { AiModelCandidate } from "./model-routing.ts";

type ReasoningEffort = "none" | "low" | "high";

export type AiModelOptions = {
  reasoningEffort?: ReasoningEffort;
  disableThinking?: boolean;
  supportsTemperature: boolean;
};

const KIMI_THINKING_MODEL = /^@cf\/moonshotai\/kimi-k2\.(?:6|7-code)$/u;
const OPENAI_REASONING_MODEL = /^(?:gpt-5(?:[.-]|$)|o\d(?:[.-]|$))/u;
const OPENAI_NO_REASONING_MODEL = /^gpt-5\.(?:[1-9]\d*)(?:[.-]|$)/u;
const OPENAI_PRO_MODEL = /-pro(?:[.-]|$)/u;

function openAiOptions(model: string): AiModelOptions {
  if (!OPENAI_REASONING_MODEL.test(model)) {
    return { supportsTemperature: true };
  }

  if (OPENAI_PRO_MODEL.test(model)) {
    return { reasoningEffort: "high", supportsTemperature: false };
  }

  if (OPENAI_NO_REASONING_MODEL.test(model)) {
    return { reasoningEffort: "none", supportsTemperature: true };
  }

  return { reasoningEffort: "low", supportsTemperature: false };
}

export function modelOptions(candidate: AiModelCandidate): AiModelOptions {
  if (candidate.transport === "byok" && candidate.provider === "openai") {
    return openAiOptions(candidate.requestModel);
  }

  if (candidate.transport === "byok" && candidate.provider === "cerebras") {
    return {
      ...(candidate.requestModel === "zai-glm-4.7"
        ? { reasoningEffort: "none" as const }
        : candidate.requestModel === "gpt-oss-120b"
          ? { reasoningEffort: "low" as const }
          : {}),
      supportsTemperature: true,
    };
  }

  if (KIMI_THINKING_MODEL.test(candidate.requestModel)) {
    return { disableThinking: true, supportsTemperature: true };
  }

  if (candidate.requestModel === "@cf/openai/gpt-oss-120b") {
    return { reasoningEffort: "low", supportsTemperature: true };
  }

  return { supportsTemperature: true };
}
