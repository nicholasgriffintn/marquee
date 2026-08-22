import { Hono } from "hono";

import type { MarqueeUser } from "../auth/model.ts";
import { attachViewer, guestIdentity, type ViewerVariables } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { clientRateLimitKey, jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { pinShelf, readPinnedShelves, unpinShelf } from "../repositories/shelves.ts";
import { getPersonalRails } from "../services/ai-rails.ts";
import { readDigest } from "../services/digest.ts";
import { getTitleInsight } from "../services/title-insight.ts";
import type { Bindings } from "../types.ts";

export const curatorRoutes = new Hono<{ Bindings: Bindings; Variables: ViewerVariables }>();

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
  const limiter = identity.isMember
    ? context.env.CURATOR_RATE_LIMITER
    : context.env.CURATOR_FREE_RATE_LIMITER;
  const { success } = await limiter.limit({
    key: clientRateLimitKey(context.req.raw, identity.sessionKey),
  });

  if (!success) {
    return jsonResponse(
      {
        error: identity.isMember
          ? "Too many curator requests. Try again in a minute."
          : "That is the free limit for now. Sign in for more, or try again in a minute.",
      },
      429,
    );
  }

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
    body: JSON.stringify({ prompt, viewerId: identity.viewerId, providerIds }),
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

curatorRoutes.get("/rails", async (context) => {
  const user = context.get("viewer");

  if (!user) {
    return jsonResponse({ error: "Sign in required" }, 401);
  }

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
  const user = context.get("viewer");

  if (!user) {
    return jsonResponse({ error: "Sign in required" }, 401);
  }

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
  const limiter = user ? context.env.CURATOR_RATE_LIMITER : context.env.INSIGHT_RATE_LIMITER;
  const { success } = await limiter.limit({
    key: clientRateLimitKey(context.req.raw, user?.id ?? "anonymous"),
  });

  if (!success) {
    return jsonResponse({ error: "Too many requests" }, 429);
  }

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

curatorRoutes.post("/pinned", async (context) => {
  const user = context.get("viewer");

  if (!user) {
    return jsonResponse({ error: "Sign in to pin a shelf" }, 401);
  }

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

curatorRoutes.delete("/pinned/:id", async (context) => {
  const user = context.get("viewer");

  if (!user) {
    return jsonResponse({ error: "Sign in to unpin a shelf" }, 401);
  }

  try {
    const removed = await unpinShelf(context.env.DB, user.id, context.req.param("id"));

    return removed ? jsonResponse({ removed: true }) : jsonResponse({ error: "Unknown" }, 404);
  } catch (error) {
    logError("pinned_delete_failed", error);

    return jsonResponse({ error: "Could not unpin that shelf" }, 500);
  }
});
