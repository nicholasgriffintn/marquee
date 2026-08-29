import { parseCookies, serializeCookie, serializeExpiredCookie } from "@ngriffin_uk/auth-cookie";
import { AuthError } from "@ngriffin_uk/auth-core";
import { Hono } from "hono";

import { API_SCOPES } from "../../src/domain/scopes.ts";
import { jsonResponse, readJsonObject, withCookies } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { randomHex } from "../lib/tokens.ts";
import { hashState } from "../repositories/links.ts";
import type { Bindings } from "../types.ts";
import { mintToken, storeApiToken } from "./api-tokens.ts";
import { authenticationFor, RETURN_COOKIE, STATE_COOKIE, type AppContext } from "./session.ts";

const NATIVE_CODE_PREFIX = "mqc_";
const NATIVE_CODE_TTL_MINUTES = 10;

const NATIVE_AUTH_COOKIE = "marquee_native_auth";
const NATIVE_AUTH_CALLBACK = "marquee://auth/callback";

export const nativeAuthRoutes = new Hono<{ Bindings: Bindings }>();

nativeAuthRoutes.get("/github", (context) => startNativeGitHub(context));
nativeAuthRoutes.get("/magic", (context) => completeNativeMagicLink(context));
nativeAuthRoutes.post("/exchange", (context) => exchangeNativeCode(context));

function mintNativeAuthCode() {
  return `${NATIVE_CODE_PREFIX}${randomHex()}`;
}

async function storeNativeAuthCode(
  env: Bindings,
  userId: string,
  code: string,
  challenge?: string,
) {
  await env.DB.prepare(`DELETE FROM native_auth_codes WHERE expires_at <= CURRENT_TIMESTAMP`).run();
  await env.DB.prepare(
    `INSERT INTO native_auth_codes (code_hash, user_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`,
  )
    .bind(
      await hashState(challenge ? `${code}:${challenge}` : code),
      userId,
      `+${NATIVE_CODE_TTL_MINUTES} minutes`,
    )
    .run();
}

async function consumeNativeAuthCode(env: Bindings, code: string, verifier?: string) {
  if (!code.startsWith(NATIVE_CODE_PREFIX) || code.length > 200) {
    return null;
  }

  const row = await env.DB.prepare(
    `DELETE FROM native_auth_codes
     WHERE code_hash = ? AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id AS userId`,
  )
    .bind(await hashState(verifier ? `${code}:${await hashState(verifier)}` : code))
    .first<{ userId: string }>();

  return row?.userId ?? null;
}

function nativeCallbackUrl(parameters: Record<string, string>) {
  const url = new URL(NATIVE_AUTH_CALLBACK);

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function completeNativeAuthentication(
  context: AppContext,
  userId: string,
  sessionToken: string,
) {
  if (!isNativeFlow(context)) {
    return null;
  }

  return finishNativeAuthentication(context, userId, sessionToken);
}

async function finishNativeAuthentication(
  context: AppContext,
  userId: string,
  sessionToken: string,
  challenge?: string,
) {
  const code = mintNativeAuthCode();

  await storeNativeAuthCode(context.env, userId, code, challenge);
  await authenticationFor(context.env, context.req.raw).logout(sessionToken);

  return withCookies(
    context.redirect(nativeCallbackUrl({ code }).href),
    ...expiredFlowCookies(context),
  );
}

async function completeNativeMagicLink(context: AppContext) {
  const url = new URL(context.req.url);
  const token = url.searchParams.get("token") ?? "";
  const challenge = url.searchParams.get("challenge") ?? "";

  if (!token || !/^[a-f\d]{64}$/u.test(challenge)) {
    return context.redirect(nativeCallbackUrl({ error: "invalid_callback" }).href);
  }

  try {
    const result = await authenticationFor(context.env, context.req.raw).completeMagicLink(token);

    if (result.status !== "authenticated") {
      throw new AuthError("unsupported_operation");
    }

    return finishNativeAuthentication(
      context,
      result.session.user.id,
      result.session.token,
      challenge,
    );
  } catch (error) {
    logError("native_magic_link_failed", error);

    return context.redirect(nativeCallbackUrl({ error: "invalid_callback" }).href);
  }
}

export function nativeAuthenticationFailure(context: AppContext, error: string) {
  if (!isNativeFlow(context)) {
    return null;
  }

  return withCookies(
    context.redirect(nativeCallbackUrl({ error }).href),
    ...expiredFlowCookies(context),
  );
}

async function startNativeGitHub(context: AppContext) {
  if (!context.env.GITHUB_CLIENT_ID || !context.env.GITHUB_CLIENT_SECRET) {
    return context.redirect(nativeCallbackUrl({ error: "provider_not_found" }).href);
  }

  try {
    const url = await authenticationFor(context.env, context.req.raw).startGitHub();
    const state = url.searchParams.get("state");

    if (!state) {
      throw new AuthError("provider_error");
    }

    return withCookies(
      context.redirect(url.href),
      temporaryCookie(context, STATE_COOKIE, state),
      temporaryCookie(context, NATIVE_AUTH_COOKIE, "ios"),
    );
  } catch (error) {
    logError("native_auth_start_failed", error);

    return context.redirect(nativeCallbackUrl({ error: "authentication_failed" }).href);
  }
}

async function exchangeNativeCode(context: AppContext) {
  const body = await readJsonObject(context.req.raw);
  const code = typeof body?.code === "string" ? body.code : "";
  const verifier = typeof body?.verifier === "string" ? body.verifier : undefined;
  const userId = await consumeNativeAuthCode(context.env, code, verifier);

  if (!userId) {
    return jsonResponse({ error: "That ticket has expired. Start again at the box office." }, 401);
  }

  const token = mintToken();

  await storeApiToken(context.env, userId, token, "Marquee for iOS", API_SCOPES);

  return jsonResponse({ token });
}

function isNativeFlow(context: AppContext) {
  return parseCookies(context.req.header("cookie") ?? "").get(NATIVE_AUTH_COOKIE) === "ios";
}

function temporaryCookie(context: AppContext, name: string, value: string) {
  return serializeCookie(name, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: usesHttps(context),
    maxAge: 600,
    priority: "high",
  });
}

function expiredFlowCookies(context: AppContext) {
  return [STATE_COOKIE, RETURN_COOKIE, NATIVE_AUTH_COOKIE].map((name) =>
    serializeExpiredCookie(name, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: usesHttps(context),
    }),
  );
}

function usesHttps(context: AppContext) {
  return canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN).startsWith("https://");
}
