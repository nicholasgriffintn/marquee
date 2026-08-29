import {
  CURATOR_SCHEMA,
  INSIGHT_SCHEMA,
  NOTE_HUNCHES_SCHEMA,
  type OutputSchema,
  RAIL_SCHEMA,
  USHER_ORDER_SCHEMA,
  USHER_PICK_SCHEMA,
} from "./schemas.ts";

export type AiFeature =
  | "curator"
  | "curator_narration"
  | "rails"
  | "insight"
  | "note_hunches"
  | "usher_order"
  | "usher_pick";

export type ModelTier = "fast" | "primary";

type Budget = {
  tier: ModelTier;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  schema: OutputSchema | null;
};

export type AiPolicy = Budget & ({ personal: true } | { personal: false; cacheSeconds: number });

const POLICIES: Record<AiFeature, AiPolicy> = {
  curator: {
    personal: true,
    tier: "fast",
    timeoutMs: 25_000,
    maxTokens: 500,
    temperature: 0.2,
    schema: CURATOR_SCHEMA,
  },
  curator_narration: {
    personal: true,
    tier: "primary",
    timeoutMs: 30_000,
    maxTokens: 400,
    temperature: 0.4,
    schema: null,
  },
  rails: {
    personal: true,
    tier: "fast",
    timeoutMs: 25_000,
    maxTokens: 500,
    temperature: 0.2,
    schema: RAIL_SCHEMA,
  },
  insight: {
    personal: false,
    cacheSeconds: 86_400,
    tier: "fast",
    timeoutMs: 30_000,
    maxTokens: 500,
    temperature: 0.2,
    schema: INSIGHT_SCHEMA,
  },
  note_hunches: {
    personal: true,
    tier: "fast",
    timeoutMs: 20_000,
    maxTokens: 260,
    temperature: 0.2,
    schema: NOTE_HUNCHES_SCHEMA,
  },
  usher_order: {
    personal: true,
    tier: "fast",
    timeoutMs: 18_000,
    maxTokens: 320,
    temperature: 0.2,
    schema: USHER_ORDER_SCHEMA,
  },
  usher_pick: {
    personal: true,
    tier: "fast",
    timeoutMs: 15_000,
    maxTokens: 160,
    temperature: 0.2,
    schema: USHER_PICK_SCHEMA,
  },
};

export function policyFor(feature: AiFeature) {
  return POLICIES[feature];
}

export function cacheSecondsFor(policy: AiPolicy) {
  return policy.personal ? 0 : policy.cacheSeconds;
}

export function collectLogFor(policy: AiPolicy) {
  return !policy.personal;
}
