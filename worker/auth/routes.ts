import { parseCookies, serializeCookie, serializeExpiredCookie } from "@ngriffin_uk/auth-cookie";
import { AuthError } from "@ngriffin_uk/auth-core";
import { Hono } from "hono";

import { emailConfigured } from "../clients/email.ts";
import { jsonResponse, readJsonObject, withCookies } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { canonicalOrigin, safeReturnPath } from "../lib/security.ts";
import { isRecord } from "../lib/values.ts";
import { confirmAlertEmail } from "../repositories/alerts.ts";
import { hashState } from "../repositories/links.ts";
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

authRoutes.post("/", (context) => runAuthProtocol(context));
authRoutes.get("/methods", (context) => listMethods(context));
authRoutes.get("/magic", (context) => completeMagicLink(context));
authRoutes.get("/alert-email", (context) => confirmAlertAddress(context));
authRoutes.get("/callback/:provider", (context) => completeOAuth(context));
authRoutes.get("/session", (context) => getSession(context));
authRoutes.post("/logout", (context) => logout(context));
authRoutes.get("/tokens", (context) => listTokens(context));
authRoutes.post("/tokens", (context) => createToken(context));
authRoutes.delete("/tokens/:id", (context) => revokeToken(context));

type ProviderId = "github";

function configuredProviders(env: Bindings) {
  const providers: { id: ProviderId; label: string }[] = [];

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.push({ id: "github", label: "Continue with GitHub" });
  }

  return providers;
}

function listMethods(context: AppContext) {
  return jsonResponse({
    providers: configuredProviders(context.env),
    magicLink: emailConfigured(context.env),
  });
}

async function completeMagicLink(context: AppContext) {
  const token = new URL(context.req.url).searchParams.get("token") ?? "";
  const returnTo = safeReturnPath(
    parseCookies(context.req.header("cookie") ?? "").get(RETURN_COOKIE),
  );

  if (!token) {
    return failedCallback(context, "invalid_callback");
  }

  try {
    const result = await authenticationFor(context.env, context.req.raw).completeMagicLink(token);

    if (result.status !== "authenticated") {
      throw new AuthError("unsupported_operation");
    }

    return withCookies(
      context.redirect(returnTo || "/"),
      sessionCookie(context, result.session.token, result.session.expiresAt),
      expiredCookie(context, RETURN_COOKIE),
    );
  } catch (error) {
    logError("magic_link_failed", error);

    return failedCallback(context, "invalid_callback");
  }
}

async function confirmAlertAddress(context: AppContext) {
  const token = new URL(context.req.url).searchParams.get("token") ?? "";
  const url = destination(context, "/notebook");

  if (!token) {
    url.searchParams.set("alertEmail", "invalid");

    return context.redirect(url.href);
  }

  try {
    const confirmed = await confirmAlertEmail(context.env.DB, await hashState(token));

    url.searchParams.set("alertEmail", confirmed ? "confirmed" : "expired");
  } catch (error) {
    logError("alert_email_confirm_failed", error);

    url.searchParams.set("alertEmail", "invalid");
  }

  return context.redirect(url.href);
}

async function runAuthProtocol(context: AppContext) {
  const body = await readJsonObject(context.req.raw);
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "sign_out") {
    return withCookies(jsonResponse({ status: "completed" }), await revokeSession(context));
  }

  if (action === "request_magic_link") {
    const values = isRecord(body?.values) ? body.values : {};
    const email = typeof values.email === "string" ? values.email.trim().slice(0, 200) : "";

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "That is not an address I can post to." }, 400);
    }

    if (!emailConfigured(context.env)) {
      return jsonResponse({ error: "The post goes out from a box we have not set up yet." }, 503);
    }

    const returnTo = safeReturnPath(typeof values.returnTo === "string" ? values.returnTo : "");

    try {
      await authenticationFor(context.env, context.req.raw).requestMagicLink(email);
    } catch (error) {
      logError("magic_link_request_failed", error);
    }

    return withCookies(
      jsonResponse({
        status: "completed",
        message: "Check your email. The link works once, and not for long.",
      }),
      returnTo ? temporaryCookie(context, RETURN_COOKIE, returnTo) : null,
    );
  }

  if (action !== "start_oauth") {
    return jsonResponse({ error: "That is not a door I can open." }, 400);
  }

  const provider = typeof body?.provider === "string" ? body.provider : "";
  const known = configuredProviders(context.env).some((entry) => entry.id === provider);

  if (!known) {
    return jsonResponse({ error: "We do not take that ticket here." }, 400);
  }

  const values = isRecord(body?.values) ? body.values : {};
  const returnTo = safeReturnPath(typeof values.returnTo === "string" ? values.returnTo : "");

  try {
    const url = await authenticationFor(context.env, context.req.raw).startGitHub();
    const state = url.searchParams.get("state");

    if (!state) {
      throw new AuthError("provider_error");
    }

    return withCookies(
      jsonResponse({ status: "redirect_required", provider, url: url.href }),
      stateCookie(context, state),
      returnTo
        ? temporaryCookie(context, RETURN_COOKIE, returnTo)
        : expiredCookie(context, RETURN_COOKIE),
    );
  } catch (error) {
    logError("auth_start_failed", error, { provider });

    return jsonResponse({ error: "The box office is closed for a moment. Try again." }, 502);
  }
}

async function completeOAuth(context: AppContext) {
  if (context.req.param("provider") !== "github") {
    return failedCallback(context, "provider_not_found");
  }

  return completeGitHub(context);
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

    return withCookies(
      context.redirect(destination(context, returnTo).href),
      ...flowCookies(context),
      sessionCookie(context, result.session.token, result.session.expiresAt),
    );
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
      role: principal.user.role,
    },
  });
}

async function revokeSession(context: AppContext) {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (principal) {
    await authenticationFor(context.env, context.req.raw).logout(principal.token);
  }

  return expiredCookie(context, SESSION_COOKIE);
}

async function logout(context: AppContext) {
  return withCookies(jsonResponse({ ok: true }), await revokeSession(context));
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

  return withCookies(context.redirect(url.href), ...flowCookies(context));
}

function destination(context: AppContext, returnTo?: string) {
  return new URL(
    safeReturnPath(returnTo) ?? "/",
    canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
  );
}

function flowCookies(context: AppContext) {
  return [expiredCookie(context, STATE_COOKIE), expiredCookie(context, RETURN_COOKIE)];
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
