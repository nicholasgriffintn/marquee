import { parseCookies } from "@ngriffin_uk/auth-cookie";
import type { Context, MiddlewareHandler } from "hono";

import { jsonResponse } from "../lib/http.ts";
import { canonicalOrigin } from "../lib/security.ts";
import type { Bindings } from "../types.ts";
import { createAuthentication } from "./authentication.ts";
import type { MarqueeUser } from "./model.ts";

export const SESSION_COOKIE = "marquee_session";
export const STATE_COOKIE = "marquee_oauth_state";
export const RETURN_COOKIE = "marquee_return_to";

export type AuthVariables = {
  authenticatedUser: MarqueeUser;
  sessionToken: string;
};

export type AppContext = Context<{ Bindings: Bindings }>;

export function authenticationFor(env: Bindings, request: Request) {
  const origin = canonicalOrigin(request, env.SITE_ORIGIN);

  return createAuthentication(env.DB, env, origin);
}

export async function sessionPrincipal(env: Bindings, request: Request) {
  const token = parseCookies(request.headers.get("cookie") ?? "").get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  const user = await authenticationFor(env, request).currentUser(token);

  return user ? { token, user } : null;
}

export const requireAuthentication: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AuthVariables;
}> = async (context, next) => {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return jsonResponse({ error: "Sign in required" }, 401);
  }

  context.set("authenticatedUser", principal.user);
  context.set("sessionToken", principal.token);
  await next();

  return context.res;
};
