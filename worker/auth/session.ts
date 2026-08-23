import { parseCookies, serializeCookie } from "@ngriffin_uk/auth-cookie";
import type { Context, MiddlewareHandler } from "hono";

import { jsonResponse } from "../lib/http.ts";
import { canonicalOrigin } from "../lib/security.ts";
import type { Bindings } from "../types.ts";
import { createAuthentication } from "./authentication.ts";
import type { MarqueeUser } from "./model.ts";

export const SESSION_COOKIE = "marquee_session";
export const GUEST_COOKIE = "marquee_guest";
export const STATE_COOKIE = "marquee_oauth_state";
export const RETURN_COOKIE = "marquee_return_to";

export type AuthVariables = {
  authenticatedUser: MarqueeUser;
  sessionToken: string;
};

export type ViewerVariables = {
  viewer: MarqueeUser | null;
};

export type AppContext = Context<{ Bindings: Bindings }>;

const GUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function authenticationFor(env: Bindings, request: Request) {
  const origin = canonicalOrigin(request, env.SITE_ORIGIN);

  return createAuthentication(env.DB, env, origin);
}

type Principal = { token: string; user: MarqueeUser };

const principals = new WeakMap<Request, Promise<Principal | null>>();

export function sessionPrincipal(env: Bindings, request: Request) {
  const cached = principals.get(request);

  if (cached) {
    return cached;
  }

  const pending = resolvePrincipal(env, request);

  principals.set(request, pending);

  return pending;
}

async function resolvePrincipal(env: Bindings, request: Request): Promise<Principal | null> {
  const token = parseCookies(request.headers.get("cookie") ?? "").get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  const user = await authenticationFor(env, request).currentUser(token);

  return user ? { token, user } : null;
}

export function guestIdentity(env: Bindings, request: Request) {
  const existing = parseCookies(request.headers.get("cookie") ?? "").get(GUEST_COOKIE);

  if (existing && GUEST_ID_PATTERN.test(existing)) {
    return { guestId: existing, cookie: null };
  }

  const guestId = crypto.randomUUID();

  return {
    guestId,
    cookie: serializeCookie(GUEST_COOKIE, guestId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: canonicalOrigin(request, env.SITE_ORIGIN).startsWith("https://"),
      maxAge: GUEST_MAX_AGE_SECONDS,
    }),
  };
}

export const attachViewer: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: ViewerVariables;
}> = async (context, next) => {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  context.set("viewer", principal?.user ?? null);
  await next();

  return context.res;
};

function requirePrincipal(
  check?: (user: MarqueeUser) => boolean,
): MiddlewareHandler<{ Bindings: Bindings; Variables: AuthVariables }> {
  return async (context, next) => {
    const principal = await sessionPrincipal(context.env, context.req.raw);

    if (!principal) {
      return jsonResponse({ error: "Sign in required" }, 401);
    }

    if (check && !check(principal.user)) {
      return jsonResponse({ error: "The manager is not in. He is never in." }, 403);
    }

    context.set("authenticatedUser", principal.user);
    context.set("sessionToken", principal.token);
    await next();

    return context.res;
  };
}

export const requireAuthentication = requirePrincipal();

export const requireAdmin = requirePrincipal((user) => user.role === "admin");
