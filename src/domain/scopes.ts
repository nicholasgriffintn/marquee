export const AGENT_SCOPES = [
  "catalogue:read",
  "shelf:read",
  "shelf:write",
  "people:follow",
] as const;

export const ACCOUNT_SCOPE = "account:full";

export const API_SCOPES = [...AGENT_SCOPES, ACCOUNT_SCOPE] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "catalogue:read": "Search and read the catalogue",
  "shelf:read": "Read your shelf, diary and what is on tonight",
  "shelf:write": "Add to and change your shelf",
  "people:follow": "Follow and unfollow credited names",
  "account:full": "Your whole account",
};

export const DEFAULT_SCOPES: readonly AgentScope[] = ["catalogue:read"];

const KNOWN: ReadonlySet<string> = new Set(API_SCOPES);
const KNOWN_AGENT: ReadonlySet<string> = new Set(AGENT_SCOPES);

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && KNOWN.has(value);
}

function requested(value: unknown) {
  return typeof value === "string" ? value.split(" ") : Array.isArray(value) ? value : [];
}

export function parseScopes(value: unknown): ApiScope[] {
  const granted = new Set(requested(value).filter(isApiScope));

  return API_SCOPES.filter((scope) => granted.has(scope));
}

export function parseAgentScopes(value: unknown): AgentScope[] {
  const asked = new Set(
    requested(value).filter((scope): scope is AgentScope => KNOWN_AGENT.has(scope as string)),
  );

  return AGENT_SCOPES.filter((scope) => asked.has(scope));
}

export function serialiseScopes(scopes: readonly ApiScope[]) {
  return parseScopes([...scopes]).join(" ");
}

export function hasScope(granted: readonly ApiScope[], required: ApiScope) {
  return granted.includes(required);
}

export function isFullAccess(granted: readonly ApiScope[]) {
  return granted.includes(ACCOUNT_SCOPE);
}
