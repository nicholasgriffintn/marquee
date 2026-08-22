import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { AiGatewayError } from "../clients/ai-gateway.ts";
import { recordEvent } from "../lib/events.ts";
import { clientRateLimitKey, jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { getPersonalRails } from "../services/ai-rails.ts";
import { curateStream } from "../services/curator.ts";
import { getTitleInsight } from "../services/title-insight.ts";
import type { Bindings } from "../types.ts";

export const curatorRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

curatorRoutes.use("*", requireAuthentication);

curatorRoutes.post("/", async (context) => {
  const user = context.get("authenticatedUser");
  const { success } = await context.env.CURATOR_RATE_LIMITER.limit({
    key: clientRateLimitKey(context.req.raw, user.id),
  });

  if (!success) {
    return jsonResponse({ error: "Too many curator requests. Try again in a minute." }, 429);
  }

  const body = await readJsonObject(context.req.raw);

  if (!body) {
    return jsonResponse({ error: "Invalid or oversized JSON" }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1_000) : "";
  const refineOf = Array.isArray(body.refineOf)
    ? body.refineOf.filter((id): id is string => isKnownTitle(id)).slice(0, 8)
    : [];

  if (!prompt) {
    return jsonResponse({ error: "Describe what kind of watch you want" }, 400);
  }

  recordEvent(context.env, { name: "curator_ask", viewerId: user.id, detail: prompt });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (payload: unknown) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

  context.executionCtx.waitUntil(
    (async () => {
      try {
        for await (const event of curateStream(context.env, prompt, user.id, refineOf)) {
          await send(event);
        }
      } catch (error) {
        logError("curator_request_failed", error);
        await send({ type: "error", message: curatorErrorMessage(error) });
      } finally {
        await writer.close();
      }
    })(),
  );

  return new Response(readable, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream",
      "x-content-type-options": "nosniff",
    },
  });
});

curatorRoutes.get("/rails", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    context.header("cache-control", "no-store");

    const { sections, isFresh } = await getPersonalRails(context.env, user.id);

    if (isFresh) {
      recordEvent(context.env, {
        name: "rails_served",
        viewerId: user.id,
        value: sections.length,
      });

      return jsonResponse({ sections, status: "ready" });
    }

    if (context.req.query("generate") === "1") {
      await context.env.RAILS_WORKFLOW.create({ params: { viewerId: user.id } });
    }

    return jsonResponse({ sections, status: "generating" });
  } catch (error) {
    logError("ai_rails_failed", error);

    return jsonResponse({ sections: [], status: "error" });
  }
});

curatorRoutes.get("/insight/:titleId", async (context) => {
  const titleId = context.req.param("titleId");

  if (!isKnownTitle(titleId)) {
    return jsonResponse({ error: "Unknown title" }, 400);
  }

  const { success } = await context.env.CURATOR_RATE_LIMITER.limit({
    key: clientRateLimitKey(context.req.raw, context.get("authenticatedUser").id),
  });

  if (!success) {
    return jsonResponse({ error: "Too many requests" }, 429);
  }

  try {
    const insight = await getTitleInsight(context.env, titleId);

    if (!insight) {
      return jsonResponse({ insight: null, pairs: [] });
    }

    const paired = await readItems(
      context.env.DB,
      insight.pairs.map((pair) => pair.titleId),
    );
    const byId = new Map(paired.map((item) => [item.id, item]));

    return jsonResponse({
      insight,
      pairs: insight.pairs.flatMap((pair) => {
        const item = byId.get(pair.titleId);

        return item ? [{ item, reason: pair.reason }] : [];
      }),
    });
  } catch (error) {
    logError("title_insight_failed", error);

    return jsonResponse({ insight: null, pairs: [] });
  }
});

function curatorErrorMessage(error: unknown) {
  if (error instanceof AiGatewayError && error.status === 402) {
    return "The AI curator has used up its Cloudflare AI allowance.";
  }

  if (error instanceof AiGatewayError && error.status === 429) {
    return "The AI curator is rate limited. Try again shortly.";
  }

  return "Cloudflare AI curator is unavailable";
}
