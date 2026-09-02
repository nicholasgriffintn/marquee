import { Hono } from "hono";

import { sessionPrincipal } from "../auth/session.ts";
import { recordEvent, type MarqueeEvent } from "../lib/events.ts";
import { readJsonObject } from "../lib/http.ts";
import { journeyLatency, journeyRank, verifyJourney } from "../lib/journeys.ts";
import { logRejection } from "../lib/logging.ts";
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

eventRoutes.post("/", async (context) => {
  const body = await readJsonObject(context.req.raw);
  const name = typeof body?.name === "string" ? body.name : "";

  if (!CLIENT_EVENTS.has(name)) {
    return context.body(null, 400);
  }

  const principal = await sessionPrincipal(context.env, context.req.raw);
  const titleId = isKnownTitle(body?.titleId) ? body.titleId : undefined;
  const [providerId] = validProviderIds([text(body?.providerId, 60) ?? ""]);
  const journey = await verifyJourney(context.env, body?.journey);
  const rank = journey ? journeyRank(body?.rank, journey) : undefined;
  const event: MarqueeEvent = {
    name: name as MarqueeEvent["name"],
    viewerId: principal?.user.id,
    ...(titleId ? { titleId } : {}),
    ...(text(body?.detail, 200) ? { detail: text(body?.detail, 200) } : {}),
    ...(journey
      ? {
          journeyId: journey.id,
          ...(journey.decisionId ? { decisionId: journey.decisionId } : {}),
          source: journey.angle,
          mode: journey.mode,
          latencyMs: journeyLatency(journey),
        }
      : {}),
    ...(rank === undefined ? {} : { rank }),
    ...(providerId ? { providerId } : {}),
    ...(text(body?.monetization, 40) ? { monetization: text(body?.monetization, 40) } : {}),
  };

  recordEvent(context.env, event);

  if (name === "provider_exit" && principal && titleId) {
    context.env.defer(
      logRejection(
        recordSignal(context.env.DB, principal.user.id, {
          type: "provider_exit",
          titleId,
          ...(journey ? { journeyId: journey.id } : {}),
          ...(journey?.decisionId ? { decisionId: journey.decisionId } : {}),
          context: {
            source: journey?.angle ?? "",
            mode: journey?.mode ?? "",
            providerId: providerId ?? "",
            monetization: event.monetization ?? "",
          },
          expiresInDays: EXIT_SIGNAL_DAYS,
        }),
        "provider_exit_signal_failed",
        { titleId },
      ),
    );
  }

  return context.body(null, 204);
});
