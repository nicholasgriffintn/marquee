import type { PolicyName } from "../security/policies.ts";

export type PolicyFixture = {
  id: string;
  path: string;
  method: string;
  /** The policy the guard must apply, or null when the path is deliberately unguarded. */
  expect: PolicyName | null;
  note: string;
};

// The guard picks the first matching rule, so the order of RULES decides what a
// path costs. These pin the decisions that are easy to break by inserting a rule
// in the wrong place.
export const POLICY_FIXTURES: readonly PolicyFixture[] = [
  {
    id: "search-is-metered",
    path: "/api/catalog/search",
    method: "GET",
    expect: "search",
    note: "Search runs vector and rerank work and must not fall through to the read tier.",
  },
  {
    id: "events-are-telemetry",
    path: "/api/events",
    method: "POST",
    expect: "telemetry",
    note: "Beacons are frequent and cheap; they must not spend the write tier.",
  },
  {
    id: "curator-ask-is-curator",
    path: "/api/curator",
    method: "POST",
    expect: "curator",
    note: "A model call, priced as one.",
  },
  {
    id: "curator-read-is-read",
    path: "/api/curator/rails",
    method: "GET",
    expect: "read",
    note: "Reading already-built rails is not a model call.",
  },
  {
    id: "usher-pick-is-usher",
    path: "/api/usher/pick",
    method: "POST",
    expect: "usher",
    note: "Picks call a model even though they sit under a member route.",
  },
  {
    id: "usher-state-is-read",
    path: "/api/usher/state",
    method: "GET",
    expect: "read",
    note: "State is a database read.",
  },
  {
    id: "shelf-write-is-write",
    path: "/api/profile/shelf",
    method: "POST",
    expect: "write",
    note: "Any unlisted API write falls to the write tier, never to read.",
  },
  {
    id: "auth-post-is-auth",
    path: "/api/auth",
    method: "POST",
    expect: "auth",
    note: "Sign-in attempts are throttled harder than other writes.",
  },
  {
    id: "token-write-is-auth",
    path: "/api/auth/tokens/abc",
    method: "DELETE",
    expect: "auth",
    note: "Revoking an API token is an auth action, not a generic write.",
  },
  {
    id: "reel-beats-media",
    path: "/media/reel/some-work",
    method: "GET",
    expect: "reel",
    note: "Reel streaming has its own limiter and must be matched before /media/*.",
  },
  {
    id: "media-is-media",
    path: "/media/posters/1.jpg",
    method: "GET",
    expect: "media",
    note: "Poster bytes stay on the media tier.",
  },
  {
    id: "feeds-are-open",
    path: "/feeds/digest.xml",
    method: "GET",
    expect: "feed",
    note: "Feed readers are bots we want.",
  },
  {
    id: "mcp-is-machine",
    path: "/mcp/tools",
    method: "POST",
    expect: "machine",
    note: "Machine callers are expected here.",
  },
  {
    id: "trailing-slash-matches",
    path: "/api/events/",
    method: "POST",
    expect: "telemetry",
    note: "A trailing slash must not slip past the rule that guards the path.",
  },
  {
    id: "pages-are-unguarded",
    path: "/listings",
    method: "GET",
    expect: null,
    note: "Static pages carry no limiter.",
  },
] as const;
