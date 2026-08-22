import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { exchangeTraktCode, getTraktUser, traktAuthorizeUrl } from "../clients/trakt.ts";
import { jsonResponse } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { canonicalOrigin, safeReturnPath } from "../lib/security.ts";
import {
  claimLinkState,
  deleteLink,
  readLink,
  saveLink,
  storeLinkState,
} from "../repositories/links.ts";
import { traktRedirectUri } from "../services/trakt.ts";
import type { Bindings } from "../types.ts";

export const linkRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

linkRoutes.use("*", requireAuthentication);

linkRoutes.get("/", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const trakt = await readLink(context.env, user.id, "trakt");

    return jsonResponse({
      links: [
        {
          provider: "trakt",
          connected: Boolean(trakt),
          available: Boolean(context.env.TRAKT_CLIENT_ID && context.env.TRAKT_CLIENT_SECRET),
          account: trakt?.accountLabel ?? null,
          syncedAt: trakt?.syncedAt ?? null,
        },
      ],
    });
  } catch (error) {
    logError("links_read_failed", error);

    return jsonResponse({ links: [] }, 500);
  }
});

linkRoutes.get("/trakt/start", async (context) => {
  const user = context.get("authenticatedUser");

  if (!context.env.TRAKT_CLIENT_ID || !context.env.TRAKT_CLIENT_SECRET) {
    return jsonResponse({ error: "Trakt is not configured" }, 503);
  }

  try {
    const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
    const state = crypto.randomUUID();

    await storeLinkState(
      context.env,
      "trakt",
      user.id,
      state,
      safeReturnPath(context.req.query("returnTo")) ?? null,
    );

    return context.redirect(traktAuthorizeUrl(context.env, traktRedirectUri(origin), state).href);
  } catch (error) {
    logError("trakt_link_start_failed", error);

    return jsonResponse({ error: "Could not start the Trakt link" }, 502);
  }
});

linkRoutes.get("/trakt/callback", async (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const code = context.req.query("code");
  const state = context.req.query("state");

  if (!code || !state) {
    return context.redirect(new URL("/shelf?linkError=invalid_callback", origin).href);
  }

  try {
    const claimed = await claimLinkState(context.env, "trakt", state);

    if (!claimed || claimed.viewerId !== context.get("authenticatedUser").id) {
      return context.redirect(new URL("/shelf?linkError=invalid_state", origin).href);
    }

    const tokens = await exchangeTraktCode(context.env, code, traktRedirectUri(origin));
    const account = await getTraktUser(context.env, tokens.accessToken).catch(() => null);

    await saveLink(context.env, claimed.viewerId, "trakt", tokens, account);
    await context.env.INGESTION_QUEUE.send(
      { type: "import-trakt-history", viewerId: claimed.viewerId, origin },
      { contentType: "json" },
    );

    return context.redirect(new URL(`${claimed.returnTo ?? "/shelf"}?linked=trakt`, origin).href);
  } catch (error) {
    logError("trakt_link_callback_failed", error);

    return context.redirect(new URL("/shelf?linkError=trakt_failed", origin).href);
  }
});

linkRoutes.post("/trakt/sync", async (context) => {
  const user = context.get("authenticatedUser");
  const link = await readLink(context.env, user.id, "trakt");

  if (!link) {
    return jsonResponse({ error: "Trakt is not linked" }, 400);
  }

  await context.env.INGESTION_QUEUE.send(
    {
      type: "import-trakt-history",
      viewerId: user.id,
      origin: canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
    },
    { contentType: "json" },
  );

  return jsonResponse({ queued: true });
});

linkRoutes.delete("/trakt", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const removed = await deleteLink(context.env, user.id, "trakt");

    return removed ? jsonResponse({ removed: true }) : jsonResponse({ error: "Not linked" }, 404);
  } catch (error) {
    logError("trakt_unlink_failed", error);

    return jsonResponse({ error: "Could not unlink Trakt" }, 500);
  }
});
