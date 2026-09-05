import { parseCookies } from "@ngriffin_uk/auth-cookie";
import { AuthError } from "@ngriffin_uk/auth-core";
import { Hono } from "hono";

import { DEFAULT_SCOPES, parseAgentScopes } from "../../src/domain/scopes.ts";
import { emailConfigured } from "../clients/email.ts";
import { jsonResponse, readJsonObject, withCookies } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { safeReturnPath } from "../lib/security.ts";
import { isRecord } from "../lib/values.ts";
import { confirmAlertEmail } from "../repositories/alerts.ts";
import { hashState } from "../repositories/links.ts";
import type { Bindings } from "../types.ts";
import {
  listApiTokens,
  mintToken,
  revokeApiToken,
  revokeBearerToken,
  storeApiToken,
} from "./api-tokens.ts";
import { destination, expiredCookie, sessionCookie, temporaryCookie } from "./cookies.ts";
import { nativeAuthRoutes } from "./native-auth.ts";
import { completeOAuth, failedCallback, startOAuth } from "./oauth-flow.ts";
import { configuredProviders } from "./providers.ts";
import {
  authenticationFor,
  RETURN_COOKIE,
  SESSION_COOKIE,
  sessionPrincipal,
  type AppContext,
} from "./session.ts";

export const authRoutes = new Hono<{ Bindings: Bindings }>();

authRoutes.post("/", (context) => runAuthProtocol(context));
authRoutes.get("/methods", (context) => listMethods(context));
authRoutes.get("/magic", (context) => completeMagicLink(context));
authRoutes.get("/alert-email", (context) => confirmAlertAddress(context));
authRoutes.get("/callback/:provider", (context) => completeOAuth(context));
authRoutes.route("/native", nativeAuthRoutes);
authRoutes.get("/session", (context) => getSession(context));
authRoutes.post("/logout", (context) => logout(context));
authRoutes.get("/tokens", (context) => listTokens(context));
authRoutes.post("/tokens", (context) => createToken(context));
authRoutes.delete("/tokens/:id", (context) => revokeToken(context));

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

  url.hash = "post";

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

  if (action === "request_magic_link" || action === "request_native_magic_link") {
    const values = isRecord(body?.values) ? body.values : {};
    const email = typeof values.email === "string" ? values.email.trim().slice(0, 200) : "";
    const nativeChallenge =
      action === "request_native_magic_link" && typeof values.challenge === "string"
        ? values.challenge
        : "";

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "That is not an address I can post to." }, 400);
    }

    if (action === "request_native_magic_link" && !/^[a-f\d]{64}$/u.test(nativeChallenge)) {
      return jsonResponse({ error: "That ticket request is incomplete. Start again." }, 400);
    }

    if (!emailConfigured(context.env)) {
      return jsonResponse({ error: "The post goes out from a box we have not set up yet." }, 503);
    }

    const returnTo = safeReturnPath(typeof values.returnTo === "string" ? values.returnTo : "");

    try {
      await authenticationFor(context.env, context.req.raw).requestMagicLink(
        email,
        action === "request_native_magic_link"
          ? { kind: "native", challenge: nativeChallenge }
          : { kind: "web" },
      );
    } catch (error) {
      logError("magic_link_request_failed", error);
    }

    return withCookies(
      jsonResponse({
        status: "completed",
        message: "Check your email. The link works once, and not for long.",
      }),
      action === "request_magic_link" && returnTo
        ? temporaryCookie(context, RETURN_COOKIE, returnTo)
        : null,
    );
  }

  if (action !== "start_oauth") {
    return jsonResponse({ error: "That is not a door I can open." }, 400);
  }

  return startOAuth(context, body);
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
    if (principal.kind === "session") {
      await authenticationFor(context.env, context.req.raw).logout(principal.token);
    } else {
      await revokeBearerToken(context.env, context.req.raw);
    }
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
  const requested = parseAgentScopes(body?.scopes);
  const scopes = requested.length > 0 ? requested : DEFAULT_SCOPES;
  const token = mintToken();

  await storeApiToken(context.env, principal.user.id, token, label || "MCP client", scopes);

  return jsonResponse({ token, label: label || "MCP client", scopes });
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
