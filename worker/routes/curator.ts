import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { clientRateLimitKey, jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { curate } from "../services/curator.ts";
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

  try {
    const result = await curate(context.env, prompt, user.id);

    return jsonResponse(result);
  } catch (error) {
    logError("curator_request_failed", error);

    return jsonResponse({ error: "Cloudflare AI curator is unavailable" }, 502);
  }
});
