import { parseCookies } from "@ngriffin_uk/auth-cookie";
import { AuthError } from "@ngriffin_uk/auth-core";

import { jsonResponse, withCookies } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { safeReturnPath } from "../lib/security.ts";
import { isRecord } from "../lib/values.ts";
import {
  destination,
  expiredCookie,
  flowCookies,
  sessionCookie,
  temporaryCookie,
} from "./cookies.ts";
import {
  completeNativeAuthentication,
  nativeAuthenticationFailure,
  NATIVE_AUTH_COOKIE,
} from "./native-auth.ts";
import { configuredProviders } from "./providers.ts";
import { authenticationFor, RETURN_COOKIE, STATE_COOKIE, type AppContext } from "./session.ts";

export async function startOAuth(context: AppContext, body: Record<string, unknown> | null) {
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const configured = configuredProviders(context.env).find((entry) => entry.id === provider);

  if (!configured) {
    return jsonResponse({ error: "We do not take that ticket here." }, 400);
  }

  const values = isRecord(body?.values) ? body.values : {};
  const returnTo = safeReturnPath(typeof values.returnTo === "string" ? values.returnTo : "");

  try {
    const url = await authenticationFor(context.env, context.req.raw).startOAuth(configured.id);
    const state = url.searchParams.get("state");

    if (!state) {
      throw new AuthError("provider_error");
    }

    return withCookies(
      jsonResponse({ status: "redirect_required", provider, url: url.href }),
      temporaryCookie(context, STATE_COOKIE, state),
      expiredCookie(context, NATIVE_AUTH_COOKIE),
      returnTo
        ? temporaryCookie(context, RETURN_COOKIE, returnTo)
        : expiredCookie(context, RETURN_COOKIE),
    );
  } catch (error) {
    logError("auth_start_failed", error, { provider });

    return jsonResponse({ error: "The box office is closed for a moment. Try again." }, 502);
  }
}

export async function completeOAuth(context: AppContext) {
  const provider = configuredProviders(context.env).find(
    (entry) => entry.id === context.req.param("provider"),
  );

  if (!provider) {
    return failedCallback(context, "provider_not_found");
  }

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
    const result = await authenticationFor(context.env, context.req.raw).completeOAuth(
      provider.id,
      code,
      state,
    );

    if (result.status !== "authenticated") {
      throw new AuthError("unsupported_operation");
    }

    const nativeResponse = await completeNativeAuthentication(
      context,
      result.session.user.id,
      result.session.token,
    );

    if (nativeResponse) {
      return nativeResponse;
    }

    return withCookies(
      context.redirect(destination(context, returnTo).href),
      ...flowCookies(context),
      sessionCookie(context, result.session.token, result.session.expiresAt),
    );
  } catch (error) {
    const codeValue = error instanceof AuthError ? error.code : "authentication_failed";

    logError("oauth_callback_failed", error, { provider: provider.id, code: codeValue });

    return failedCallback(context, codeValue);
  }
}

export function failedCallback(context: AppContext, error: string) {
  const nativeResponse = nativeAuthenticationFailure(context, error);

  if (nativeResponse) {
    return nativeResponse;
  }

  const url = destination(context);

  url.searchParams.set("authError", error);

  return withCookies(context.redirect(url.href), ...flowCookies(context));
}
