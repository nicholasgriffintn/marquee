import { serializeCookie, serializeExpiredCookie } from "@ngriffin_uk/auth-cookie";

import { canonicalOrigin, safeReturnPath } from "../lib/security.ts";
import { RETURN_COOKIE, SESSION_COOKIE, STATE_COOKIE, type AppContext } from "./session.ts";

export function destination(context: AppContext, returnTo?: string) {
  return new URL(
    safeReturnPath(returnTo) ?? "/",
    canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
  );
}

export function flowCookies(context: AppContext) {
  return [expiredCookie(context, STATE_COOKIE), expiredCookie(context, RETURN_COOKIE)];
}

export function temporaryCookie(context: AppContext, name: string, value: string) {
  return serializeCookie(name, value, cookieAttributes(context, { maxAge: 600 }));
}

export function sessionCookie(context: AppContext, token: string, expiresAt: Date) {
  return serializeCookie(
    SESSION_COOKIE,
    token,
    cookieAttributes(context, {
      expires: expiresAt,
      maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000)),
    }),
  );
}

export function expiredCookie(context: AppContext, name: string) {
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
