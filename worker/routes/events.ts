import { Hono } from "hono";

import { sessionPrincipal } from "../auth/session.ts";
import { recordSignal } from "../repositories/signals.ts";
import type { Bindings } from "../types.ts";
import { parseClientEventRequest, recordClientEvent } from "./event-payload.ts";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

const EXIT_SIGNAL_DAYS = 180;

eventRoutes.post("/", async (context) => {
  const parsed = await parseClientEventRequest(context.req.raw);

  if (!parsed) {
    return context.body(null, 400);
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);
  const event = recordClientEvent(context.env, parsed, principal?.user.id);

  if (event.name === "provider_exit" && principal && event.titleId) {
    context.executionCtx.waitUntil(
      recordSignal(context.env.DB, principal.user.id, {
        type: "provider_exit",
        titleId: event.titleId,
        ...(event.journeyId ? { journeyId: event.journeyId } : {}),
        context: {
          source: event.source ?? "",
          providerId: event.providerId ?? "",
          monetization: event.monetization ?? "",
        },
        expiresInDays: EXIT_SIGNAL_DAYS,
      }),
    );
  }

  return context.body(null, 204);
});
