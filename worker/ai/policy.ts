import {
  CURATOR_SCHEMA,
  INSIGHT_SCHEMA,
  NOTE_FACETS_SCHEMA,
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
  | "note_facets"
  | "usher_order"
  | "usher_pick"
  | "usher_answer";

export type ModelTier = "fast" | "primary";

export type CachePolicy = { enabled: boolean; ttlSeconds?: number };

export type AiPolicy = {
  tier: ModelTier;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  schema: OutputSchema | null;
  collectLog: boolean;
  cache: CachePolicy;
};

const LOGGED_AND_CACHED = { collectLog: true, cache: { enabled: true } } as const;

const POLICIES: Record<AiFeature, AiPolicy> = {
  curator: {
    ...LOGGED_AND_CACHED,
    tier: "fast",
    timeoutMs: 25_000,
    maxTokens: 500,
    temperature: 0.2,
    schema: CURATOR_SCHEMA,
  },
  curator_narration: {
    ...LOGGED_AND_CACHED,
    tier: "primary",
    timeoutMs: 30_000,
    maxTokens: 400,
    temperature: 0.4,
    schema: null,
  },
  rails: {
    ...LOGGED_AND_CACHED,
    tier: "fast",
    timeoutMs: 25_000,
    maxTokens: 500,
    temperature: 0.2,
    schema: RAIL_SCHEMA,
  },
  insight: {
    collectLog: true,
    cache: { enabled: true, ttlSeconds: 86_400 },
    tier: "fast",
    timeoutMs: 30_000,
    maxTokens: 500,
    temperature: 0.2,
    schema: INSIGHT_SCHEMA,
  },
  note_facets: {
    ...LOGGED_AND_CACHED,
    tier: "fast",
    timeoutMs: 20_000,
    maxTokens: 320,
    temperature: 0.2,
    schema: NOTE_FACETS_SCHEMA,
  },
  usher_order: {
    ...LOGGED_AND_CACHED,
    tier: "fast",
    timeoutMs: 18_000,
    maxTokens: 320,
    temperature: 0.2,
    schema: USHER_ORDER_SCHEMA,
  },
  usher_pick: {
    ...LOGGED_AND_CACHED,
    tier: "fast",
    timeoutMs: 15_000,
    maxTokens: 160,
    temperature: 0.2,
    schema: USHER_PICK_SCHEMA,
  },
  usher_answer: {
    collectLog: true,
    cache: { enabled: false },
    tier: "fast",
    timeoutMs: 20_000,
    maxTokens: 260,
    temperature: 0.4,
    schema: null,
  },
};

export function policyFor(feature: AiFeature) {
  return POLICIES[feature];
}
