import { parseCookies, serializeCookie, serializeExpiredCookie } from "@ngriffin_uk/auth-cookie";
import { AuthError } from "@ngriffin_uk/auth-core";
import { Hono } from "hono";

import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { canonicalOrigin, safeReturnPath } from "../lib/security.ts";
import type { Bindings } from "../types.ts";
import { listApiTokens, mintToken, revokeApiToken, storeApiToken } from "./api-tokens.ts";
import {
  authenticationFor,
  RETURN_COOKIE,
  SESSION_COOKIE,
  sessionPrincipal,
  STATE_COOKIE,
  type AppContext,
} from "./session.ts";

export const authRoutes = new Hono<{ Bindings: Bindings }>();

authRoutes.get("/github", (context) => startGitHub(context));
authRoutes.get("/github/callback", (context) => completeGitHub(context));
authRoutes.get("/session", (context) => getSession(context));
authRoutes.post("/logout", (context) => logout(context));
authRoutes.get("/tokens", (context) => listTokens(context));
authRoutes.post("/tokens", (context) => createToken(context));
authRoutes.delete("/tokens/:id", (context) => revokeToken(context));

async function startGitHub(context: AppContext) {
  const actor = context.req.header("cf-connecting-ip")?.trim().slice(0, 64) || "local";
  const { success } = await context.env.AUTH_RATE_LIMITER.limit({ key: `github:${actor}` });

  if (!success) {
    return jsonResponse({ error: "Too many sign-in attempts. Try again shortly." }, 429);
  }

  const url = await authenticationFor(context.env, context.req.raw).startGitHub();
  const state = url.searchParams.get("state");

  if (!state) {
    throw new AuthError("provider_error");
  }

  const returnTo = safeReturnPath(context.req.query("returnTo"));

  context.header("set-cookie", stateCookie(context, state), { append: true });
  context.header(
    "set-cookie",
    returnTo
      ? temporaryCookie(context, RETURN_COOKIE, returnTo)
      : expiredCookie(context, RETURN_COOKIE),
    { append: true },
  );

  return context.redirect(url.href);
}

async function completeGitHub(context: AppContext) {
  const url = new URL(context.req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const cookies = parseCookies(context.req.header("cookie") ?? "");
  const stateCookieValue = cookies.get(STATE_COOKIE);
  const returnTo = safeReturnPath(cookies.get(RETURN_COOKIE));

  if (!state || !code || !stateCookieValue || state !== stateCookieValue) {
    return failedCallback(context, "invalid_callback");
  }

  try {
    const result = await authenticationFor(context.env, context.req.raw).completeGitHub(
      code,
      state,
    );

    if (result.status !== "authenticated") {
      throw new AuthError("unsupported_operation");
    }

    expireFlowCookies(context);
    context.header(
      "set-cookie",
      sessionCookie(context, result.session.token, result.session.expiresAt),
      { append: true },
    );

    return context.redirect(destination(context, returnTo).href);
  } catch (error) {
    const codeValue = error instanceof AuthError ? error.code : "authentication_failed";

    logError("github_oauth_callback_failed", error, { code: codeValue });

    return failedCallback(context, codeValue);
  }
}

async function getSession(context: AppContext) {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return jsonResponse({ user: null });
  }

  return jsonResponse({
    user: {
      id: principal.user.id,
      name: principal.user.displayName,
      login: principal.user.githubLogin,
      avatarUrl: principal.user.avatarUrl ?? null,
    },
  });
}

async function logout(context: AppContext) {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (principal) {
    await authenticationFor(context.env, context.req.raw).logout(principal.token);
  }

  context.header("set-cookie", expiredCookie(context, SESSION_COOKIE));

  return jsonResponse({ ok: true });
}

async function listTokens(context: AppContext) {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return jsonResponse({ error: "Sign in required" }, 401);
  }

  return jsonResponse({ tokens: await listApiTokens(context.env, principal.user.id) });
}

async function createToken(context: AppContext) {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return jsonResponse({ error: "Sign in required" }, 401);
  }

  const body = await readJsonObject(context.req.raw);
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : "";
  const token = mintToken();

  await storeApiToken(context.env, principal.user.id, token, label || "MCP client");

  return jsonResponse({ token, label: label || "MCP client" });
}

async function revokeToken(context: AppContext) {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return jsonResponse({ error: "Sign in required" }, 401);
  }

  const id = context.req.param("id");
  const removed = await revokeApiToken(context.env, principal.user.id, id ?? "");

  return removed ? jsonResponse({ removed: true }) : jsonResponse({ error: "Unknown token" }, 404);
}

function failedCallback(context: AppContext, error: string) {
  const url = destination(context);

  url.searchParams.set("authError", error);
  expireFlowCookies(context);

  return context.redirect(url.href);
}

function destination(context: AppContext, returnTo?: string) {
  return new URL(
    safeReturnPath(returnTo) ?? "/",
    canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
  );
}

function expireFlowCookies(context: AppContext) {
  context.header("set-cookie", expiredCookie(context, STATE_COOKIE), { append: true });
  context.header("set-cookie", expiredCookie(context, RETURN_COOKIE), { append: true });
}

function stateCookie(context: AppContext, state: string) {
  return temporaryCookie(context, STATE_COOKIE, state);
}

function temporaryCookie(context: AppContext, name: string, value: string) {
  return serializeCookie(name, value, cookieAttributes(context, { maxAge: 600 }));
}

function sessionCookie(context: AppContext, token: string, expiresAt: Date) {
  return serializeCookie(
    SESSION_COOKIE,
    token,
    cookieAttributes(context, {
      expires: expiresAt,
      maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000)),
    }),
  );
}

function expiredCookie(context: AppContext, name: string) {
  return serializeExpiredCookie(name, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: usesHttps(context),
  });
}

function cookieAttributes(context: AppContext, attributes: { expires?: Date; maxAge: number }) {
  return {
    ...attributes,
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: usesHttps(context),
    priority: "high" as const,
  };
}

function usesHttps(context: AppContext) {
  return canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN).startsWith("https://");
}
