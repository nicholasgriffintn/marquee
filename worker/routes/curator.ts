import { Hono } from "hono";

import type { MarqueeUser } from "../auth/model.ts";
import {
  attachViewer,
  type AuthVariables,
  guestIdentity,
  requireViewer,
  type ViewerVariables,
} from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { mintJourney, ticketSections } from "../lib/journeys.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { pinShelf, readPinnedShelves, unpinShelf } from "../repositories/shelves.ts";
import { getAiRails } from "../services/ai-rails.ts";
import { readDigest } from "../services/digest.ts";
import { getTitleInsight } from "../services/title-insight.ts";
import { readViewerState } from "../services/viewer/state.ts";
import type { Bindings } from "../types.ts";
import { viewerHour } from "./usher.ts";

export const curatorRoutes = new Hono<{
  Bindings: Bindings;
  Variables: ViewerVariables & AuthVariables;
}>();

curatorRoutes.use("*", attachViewer);

function askIdentity(env: Bindings, request: Request, user: MarqueeUser | null) {
  if (user) {
    return { sessionKey: user.id, viewerId: user.id, isMember: true, cookie: null };
  }

  const guest = guestIdentity(env, request);

  return {
    sessionKey: `guest:${guest.guestId}`,
    viewerId: "",
    isMember: false,
    cookie: guest.cookie,
  };
}

curatorRoutes.post("/", async (context) => {
  const identity = askIdentity(context.env, context.req.raw, context.get("viewer"));
  const body = await readJsonObject(context.req.raw);

  if (!body) {
    return jsonResponse({ error: "Invalid or oversized JSON" }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1_000) : "";

  if (!prompt) {
    return jsonResponse({ error: "Describe what kind of watch you want" }, 400);
  }

  const providerIds = validProviderIds(
    Array.isArray(body.providerIds) ? body.providerIds : [],
  ).slice(0, 24);

  recordEvent(context.env, {
    name: "curator_ask",
    viewerId: identity.viewerId || undefined,
    detail: prompt,
  });

  const session = context.env.CURATOR_SESSION.get(
    context.env.CURATOR_SESSION.idFromName(identity.sessionKey),
  );
  const streamed = await session.fetch("https://curator/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      viewerId: identity.viewerId,
      providerIds,
      hour: viewerHour(body.hour),
      isWeekend: body.isWeekend === true,
    }),
  });

  if (!identity.cookie) {
    return streamed;
  }

  const response = new Response(streamed.body, streamed);

  response.headers.append("set-cookie", identity.cookie);

  return response;
});

curatorRoutes.delete("/", async (context) => {
  const identity = askIdentity(context.env, context.req.raw, context.get("viewer"));

  if (identity.cookie) {
    return jsonResponse({ cleared: true });
  }

  const session = context.env.CURATOR_SESSION.get(
    context.env.CURATOR_SESSION.idFromName(identity.sessionKey),
  );

  await session.fetch("https://curator/reset", { method: "POST" });

  return jsonResponse({ cleared: true });
});

curatorRoutes.get("/rails", requireViewer, async (context) => {
  const user = context.get("authenticatedUser");

  try {
    context.header("cache-control", "no-store");

    const startedAt = Date.now();
    const viewer = await readViewerState(context.env, user.id);
    const { sections, isFresh } = await getAiRails(context.env, viewer);

    if (isFresh) {
      const ticketed = await ticketSections(context.env, sections, "ai-rail");

      recordEvent(context.env, {
        name: "rails_served",
        viewerId: user.id,
        mode: "ai-rail",
        value: ticketed.length,
        latencyMs: Date.now() - startedAt,
      });

      return jsonResponse({ sections: ticketed, status: "ready" });
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

curatorRoutes.get("/digest", requireViewer, async (context) => {
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

  const user = context.get("viewer");

  try {
    const insight = await getTitleInsight(context.env, titleId, { generate: Boolean(user) });

    if (!insight) {
      return jsonResponse({ insight: null, pairs: [] });
    }

    const paired = await readItems(
      context.env.DB,
      insight.pairs.map((pair) => pair.titleId),
    );
    const byId = new Map(paired.map((item) => [item.id, item]));
    const pairs = insight.pairs.flatMap((pair) => {
      const item = byId.get(pair.titleId);

      return item ? [{ item, reason: pair.reason }] : [];
    });
    const journey = await mintJourney(context.env, {
      mode: "insight",
      angle: "insight_pair",
      size: pairs.length,
      decisionId: insight.decisionId,
    });
    const { decisionId: _decisionId, ...publicInsight } = insight;

    return jsonResponse({
      insight: publicInsight,
      pairs,
      journey: journey.token,
    });
  } catch (error) {
    logError("title_insight_failed", error);

    return jsonResponse({ insight: null, pairs: [] });
  }
});

curatorRoutes.get("/pinned", async (context) => {
  const user = context.get("viewer");

  if (!user) {
    return jsonResponse({ sections: [] });
  }

  try {
    context.header("cache-control", "no-store");

    const shelves = await readPinnedShelves(context.env.DB, user.id);
    const titles = await readItems(
      context.env.DB,
      shelves.flatMap((shelf) => shelf.titleIds),
      60,
    );
    const byId = new Map(titles.map((title) => [title.id, title]));

    return jsonResponse({
      sections: shelves.flatMap((shelf) => {
        const items = shelf.titleIds.flatMap((titleId) => {
          const item = byId.get(titleId);

          return item ? [item] : [];
        });

        return items.length
          ? [
              {
                id: `pinned-${shelf.id}`,
                title: shelf.name,
                description: shelf.reason || shelf.prompt,
                items,
              },
            ]
          : [];
      }),
    });
  } catch (error) {
    logError("pinned_read_failed", error);

    return jsonResponse({ sections: [] });
  }
});

curatorRoutes.post("/pinned", requireViewer, async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const titleIds = Array.isArray(body?.titleIds)
    ? [...new Set(body.titleIds.filter(isKnownTitle))].slice(0, 12)
    : [];

  if (titleIds.length === 0) {
    return jsonResponse({ error: "Nothing to pin" }, 400);
  }

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";

  try {
    const id = await pinShelf(context.env.DB, user.id, {
      name: name || "Pinned",
      prompt: typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 200) : "",
      reason: typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : "",
      titleIds,
    });

    recordEvent(context.env, { name: "shelf_pinned", viewerId: user.id, value: titleIds.length });

    return jsonResponse({ id });
  } catch (error) {
    logError("pinned_write_failed", error);

    return jsonResponse({ error: "Could not pin that shelf" }, 500);
  }
});

curatorRoutes.delete("/pinned/:id", requireViewer, async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const removed = await unpinShelf(context.env.DB, user.id, context.req.param("id"));

    return removed ? jsonResponse({ removed: true }) : jsonResponse({ error: "Unknown" }, 404);
  } catch (error) {
    logError("pinned_delete_failed", error);

    return jsonResponse({ error: "Could not unpin that shelf" }, 500);
  }
});
