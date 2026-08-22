import type { Bindings } from "../types.ts";
import type { BotStance } from "./bots.ts";

export type LimiterKey = {
  [Key in keyof Bindings]-?: Bindings[Key] extends RateLimit ? Key : never;
}[keyof Bindings];

export type Tier = { limiter: LimiterKey; message: string };

export type Policy = { anonymous: Tier; member: Tier; bots: BotStance };

const TOO_MANY = "Too many requests. Try again in a minute.";

export const POLICIES = {
  read: {
    anonymous: { limiter: "PUBLIC_RATE_LIMITER", message: TOO_MANY },
    member: { limiter: "MEMBER_RATE_LIMITER", message: TOO_MANY },
    bots: "crawlers",
  },
  write: {
    anonymous: { limiter: "WRITE_RATE_LIMITER", message: TOO_MANY },
    member: { limiter: "MEMBER_RATE_LIMITER", message: TOO_MANY },
    bots: "strict",
  },
  search: {
    anonymous: {
      limiter: "SEARCH_RATE_LIMITER",
      message: "Too many searches. Try again in a minute.",
    },
    member: {
      limiter: "SEARCH_MEMBER_RATE_LIMITER",
      message: "Too many searches. Try again in a minute.",
    },
    bots: "strict",
  },
  curator: {
    anonymous: {
      limiter: "CURATOR_FREE_RATE_LIMITER",
      message: "That is the free limit for now. Sign in for more, or try again in a minute.",
    },
    member: {
      limiter: "CURATOR_RATE_LIMITER",
      message: "Too many curator requests. Try again in a minute.",
    },
    bots: "strict",
  },
  insight: {
    anonymous: { limiter: "INSIGHT_RATE_LIMITER", message: TOO_MANY },
    member: { limiter: "CURATOR_RATE_LIMITER", message: TOO_MANY },
    bots: "strict",
  },
  usher: {
    anonymous: { limiter: "CURATOR_FREE_RATE_LIMITER", message: "Give me a minute." },
    member: { limiter: "CURATOR_RATE_LIMITER", message: "Give me a minute." },
    bots: "strict",
  },
  auth: {
    anonymous: {
      limiter: "AUTH_RATE_LIMITER",
      message: "Too many sign-in attempts. Try again shortly.",
    },
    member: {
      limiter: "AUTH_RATE_LIMITER",
      message: "Too many sign-in attempts. Try again shortly.",
    },
    bots: "strict",
  },
  telemetry: {
    anonymous: { limiter: "TELEMETRY_RATE_LIMITER", message: TOO_MANY },
    member: { limiter: "MEMBER_RATE_LIMITER", message: TOO_MANY },
    bots: "strict",
  },
  media: {
    anonymous: { limiter: "MEDIA_RATE_LIMITER", message: TOO_MANY },
    member: { limiter: "MEDIA_RATE_LIMITER", message: TOO_MANY },
    bots: "crawlers",
  },
  machine: {
    anonymous: { limiter: "WRITE_RATE_LIMITER", message: TOO_MANY },
    member: { limiter: "MEMBER_RATE_LIMITER", message: TOO_MANY },
    bots: "open",
  },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof POLICIES;

export type Rule = { path: string; methods?: readonly string[]; policy: PolicyName };

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

export const RULES: readonly Rule[] = [
  { path: "/api/auth/github", policy: "auth" },
  { path: "/api/auth/github/callback", policy: "auth" },
  { path: "/api/auth/tokens", methods: WRITE_METHODS, policy: "auth" },
  { path: "/api/auth/tokens/*", methods: WRITE_METHODS, policy: "auth" },
  { path: "/api/catalog/search", policy: "search" },
  { path: "/api/curator", methods: ["POST"], policy: "curator" },
  { path: "/api/curator/insight/*", policy: "insight" },
  { path: "/api/events", policy: "telemetry" },
  { path: "/api/usher/pick", methods: ["POST"], policy: "usher" },
  { path: "/api/links/trakt/start", policy: "auth" },
  { path: "/api/links/trakt/callback", policy: "auth" },
  { path: "/mcp", policy: "machine" },
  { path: "/mcp/*", policy: "machine" },
  { path: "/media/*", policy: "media" },
  { path: "/api/*", methods: WRITE_METHODS, policy: "write" },
  { path: "/api/*", policy: "read" },
];

export function matchPolicy(path: string, method: string) {
  const target = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const rule = RULES.find(
    (candidate) =>
      matchesPath(candidate.path, target) &&
      (!candidate.methods || candidate.methods.includes(method)),
  );

  return rule ? { name: rule.policy, policy: POLICIES[rule.policy] as Policy } : null;
}

function matchesPath(pattern: string, path: string) {
  return pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path;
}
