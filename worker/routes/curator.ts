import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { clientRateLimitKey, jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { getPersonalRails } from "../services/ai-rails.ts";
import { readDigest } from "../services/digest.ts";
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

  if (!prompt) {
    return jsonResponse({ error: "Describe what kind of watch you want" }, 400);
  }

  recordEvent(context.env, { name: "curator_ask", viewerId: user.id, detail: prompt });

  const session = context.env.CURATOR_SESSION.get(context.env.CURATOR_SESSION.idFromName(user.id));

  return session.fetch("https://curator/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, viewerId: user.id }),
  });
});

curatorRoutes.delete("/", async (context) => {
  const user = context.get("authenticatedUser");
  const session = context.env.CURATOR_SESSION.get(context.env.CURATOR_SESSION.idFromName(user.id));

  await session.fetch("https://curator/reset", { method: "POST" });

  return jsonResponse({ cleared: true });
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

curatorRoutes.get("/digest", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    context.header("cache-control", "no-store");

    return jsonResponse({ digest: await readDigest(context.env, user.id) });
  } catch (error) {
    logError("digest_read_failed", error);

    return jsonResponse({ digest: null });
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
