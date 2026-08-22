import { Hono } from "hono";

import { sessionPrincipal } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { clientRateLimitKey, readJsonObject } from "../lib/http.ts";
import { isKnownTitle } from "../lib/validation.ts";
import type { Bindings } from "../types.ts";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

const CLIENT_EVENTS = new Set(["rail_impression", "rail_click"]);

eventRoutes.post("/", async (context) => {
  const body = await readJsonObject(context.req.raw);
  const name = typeof body?.name === "string" ? body.name : "";

  if (!CLIENT_EVENTS.has(name)) {
    return context.body(null, 400);
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);
  const { success } = await context.env.SEARCH_RATE_LIMITER.limit({
    key: clientRateLimitKey(context.req.raw, principal?.user.id ?? "anonymous"),
  });

  if (!success) {
    return context.body(null, 429);
  }

  recordEvent(context.env, {
    name: name as "rail_impression" | "rail_click",
    viewerId: principal?.user.id,
    titleId: isKnownTitle(body?.titleId) ? body.titleId : undefined,
    detail: typeof body?.detail === "string" ? body.detail : undefined,
  });

  return context.body(null, 204);
});
