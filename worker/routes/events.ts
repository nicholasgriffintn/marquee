import { Hono } from "hono";

import { sessionPrincipal } from "../auth/session.ts";
import { recordEvent, type MarqueeEvent } from "../lib/events.ts";
import { readJsonObject } from "../lib/http.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { recordSignal } from "../repositories/signals.ts";
import type { Bindings } from "../types.ts";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

const CLIENT_EVENTS = new Set([
  "rail_impression",
  "rail_click",
  "title_view",
  "provider_exit",
  "reel_play",
]);

const EXIT_SIGNAL_DAYS = 180;

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : undefined;
}

function position(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed < 500 ? parsed : undefined;
}

eventRoutes.post("/", async (context) => {
  const body = await readJsonObject(context.req.raw);
  const name = typeof body?.name === "string" ? body.name : "";

  if (!CLIENT_EVENTS.has(name)) {
    return context.body(null, 400);
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);
  const titleId = isKnownTitle(body?.titleId) ? body.titleId : undefined;
  const [providerId] = validProviderIds([text(body?.providerId, 60) ?? ""]);
  const event: MarqueeEvent = {
    name: name as MarqueeEvent["name"],
    viewerId: principal?.user.id,
    ...(titleId ? { titleId } : {}),
    ...(text(body?.detail, 200) ? { detail: text(body?.detail, 200) } : {}),
    ...(text(body?.journeyId, 40) ? { journeyId: text(body?.journeyId, 40) } : {}),
    ...(text(body?.source, 60) ? { source: text(body?.source, 60) } : {}),
    ...(position(body?.position) === undefined ? {} : { position: position(body?.position) }),
    ...(providerId ? { providerId } : {}),
    ...(text(body?.monetization, 40) ? { monetization: text(body?.monetization, 40) } : {}),
  };

  recordEvent(context.env, event);

  if (name === "provider_exit" && principal && titleId) {
    context.executionCtx.waitUntil(
      recordSignal(context.env.DB, principal.user.id, {
        type: "provider_exit",
        titleId,
        ...(event.journeyId ? { journeyId: event.journeyId } : {}),
        context: {
          source: event.source ?? "",
          providerId: providerId ?? "",
          monetization: event.monetization ?? "",
        },
        expiresInDays: EXIT_SIGNAL_DAYS,
      }),
    );
  }

  return context.body(null, 204);
});
