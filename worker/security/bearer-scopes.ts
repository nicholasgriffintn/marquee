import type { MiddlewareHandler } from "hono";

import { ACCOUNT_SCOPE, isFullAccess } from "../../src/domain/scopes.ts";
import { bearerToken } from "../auth/api-tokens.ts";
import { sessionPrincipal } from "../auth/session.ts";
import { jsonResponse } from "../lib/http.ts";
import type { Bindings } from "../types.ts";

const TOKEN_ADMINISTRATION = "/api/auth/tokens";

function insufficient(message: string, scope: string) {
  return jsonResponse({ error: message, requiredScope: scope }, 403, {
    "www-authenticate": `Bearer error="insufficient_scope", scope="${scope}"`,
  });
}

function administersTokens(path: string) {
  return path === TOKEN_ADMINISTRATION || path.startsWith(`${TOKEN_ADMINISTRATION}/`);
}

export const bearerScopeGuard: MiddlewareHandler<{ Bindings: Bindings }> = async (
  context,
  next,
) => {
  if (!bearerToken(context.req.raw)) {
    return next();
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (principal?.kind !== "bearer") {
    return next();
  }

  if (administersTokens(context.req.path)) {
    return insufficient("Tokens are managed while signed in, not by another token.", "session");
  }

  if (!isFullAccess(principal.scopes)) {
    return insufficient(
      "This token is scoped to Marquee's MCP tools. Use it against /mcp.",
      ACCOUNT_SCOPE,
    );
  }

  return next();
};
