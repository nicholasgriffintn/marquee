import type { Bindings } from "../types.ts";
import type { BotStance } from "./bots.ts";

export type LimiterKey = {
  [Key in keyof Bindings]-?: Bindings[Key] extends RateLimit ? Key : never;
}[keyof Bindings];

export type Tier = { limiter: LimiterKey; message: string };

export type Policy = { anonymous: Tier; member: Tier; bots: BotStance };

const STEADY_ON = "Steady on. One at a time.";

export const POLICIES = {
  read: {
    anonymous: { limiter: "PUBLIC_RATE_LIMITER", message: STEADY_ON },
    member: { limiter: "MEMBER_RATE_LIMITER", message: STEADY_ON },
    bots: "crawlers",
  },
  write: {
    anonymous: {
      limiter: "WRITE_RATE_LIMITER",
      message: "One at a time. I have only the two hands.",
    },
    member: {
      limiter: "MEMBER_RATE_LIMITER",
      message: "One at a time. I have only the two hands.",
    },
    bots: "strict",
  },
  search: {
    anonymous: {
      limiter: "SEARCH_RATE_LIMITER",
      message: "You have searched enough for one minute.",
    },
    member: {
      limiter: "SEARCH_MEMBER_RATE_LIMITER",
      message: "You have searched enough for one minute.",
    },
    bots: "strict",
  },
  curator: {
    anonymous: {
      limiter: "CURATOR_FREE_RATE_LIMITER",
      message: "That is your lot for now. Sign in and I will look the other way.",
    },
    member: {
      limiter: "CURATOR_RATE_LIMITER",
      message: "One at a time. I am still on the last one.",
    },
    bots: "strict",
  },
  insight: {
    anonymous: { limiter: "INSIGHT_RATE_LIMITER", message: "Steady on. I am still reading." },
    member: { limiter: "CURATOR_RATE_LIMITER", message: "Steady on. I am still reading." },
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
      message: "That is a lot of attempts at one door. Wait a minute.",
    },
    member: {
      limiter: "AUTH_RATE_LIMITER",
      message: "That is a lot of attempts at one door. Wait a minute.",
    },
    bots: "strict",
  },
  telemetry: {
    anonymous: { limiter: "TELEMETRY_RATE_LIMITER", message: STEADY_ON },
    member: { limiter: "MEMBER_RATE_LIMITER", message: STEADY_ON },
    bots: "strict",
  },
  media: {
    anonymous: { limiter: "MEDIA_RATE_LIMITER", message: STEADY_ON },
    member: { limiter: "MEDIA_RATE_LIMITER", message: STEADY_ON },
    bots: "crawlers",
  },
  feed: {
    anonymous: { limiter: "PUBLIC_RATE_LIMITER", message: STEADY_ON },
    member: { limiter: "MEMBER_RATE_LIMITER", message: STEADY_ON },
    bots: "open",
  },
  machine: {
    anonymous: { limiter: "WRITE_RATE_LIMITER", message: STEADY_ON },
    member: { limiter: "MEMBER_RATE_LIMITER", message: STEADY_ON },
    bots: "open",
  },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof POLICIES;

export type Rule = { path: string; methods?: readonly string[]; policy: PolicyName };

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

export const RULES: readonly Rule[] = [
  { path: "/api/auth", methods: ["POST"], policy: "auth" },
  { path: "/api/auth/methods", policy: "auth" },
  { path: "/api/auth/magic", policy: "auth" },
  { path: "/api/auth/alert-email", policy: "auth" },
  { path: "/api/auth/callback/*", policy: "auth" },
  { path: "/api/auth/tokens", methods: WRITE_METHODS, policy: "auth" },
  { path: "/api/auth/tokens/*", methods: WRITE_METHODS, policy: "auth" },
  { path: "/api/catalog/search", policy: "search" },
  { path: "/api/curator", methods: ["POST"], policy: "curator" },
  { path: "/api/curator/insight/*", policy: "insight" },
  { path: "/api/events", policy: "telemetry" },
  { path: "/api/usher/pick", methods: ["POST"], policy: "usher" },
  { path: "/api/usher/order", methods: ["POST"], policy: "usher" },
  { path: "/api/profile/import/*", methods: ["POST"], policy: "curator" },
  { path: "/api/links/trakt/start", policy: "auth" },
  { path: "/api/links/trakt/callback", policy: "auth" },
  { path: "/feeds/*", policy: "feed" },
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
