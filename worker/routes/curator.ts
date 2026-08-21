import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { AiGatewayError } from "../clients/ai-gateway.ts";
import { clientRateLimitKey, jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { curateStream } from "../services/curator.ts";
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

  if (!prompt) {
    return jsonResponse({ error: "Describe what kind of watch you want" }, 400);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (payload: unknown) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

  context.executionCtx.waitUntil(
    (async () => {
      try {
        for await (const event of curateStream(context.env, prompt, user.id)) {
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

function curatorErrorMessage(error: unknown) {
  if (error instanceof AiGatewayError && error.status === 402) {
    return "The AI curator has used up its Cloudflare AI allowance.";
  }

  if (error instanceof AiGatewayError && error.status === 429) {
    return "The AI curator is rate limited. Try again shortly.";
  }

  return "Cloudflare AI curator is unavailable";
}
