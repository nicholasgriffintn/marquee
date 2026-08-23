import { Hono } from "hono";

import { isBeliefScope } from "../../src/domain/notebook.ts";
import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { retryTransient } from "../lib/retry.ts";
import { editBelief, readBeliefs } from "../repositories/beliefs.ts";
import {
  GUEST_LIMIT,
  guestCount,
  readGuests,
  removeGuest,
  saveGuest,
} from "../repositories/guests.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import { refreshBeliefs } from "../services/beliefs.ts";
import type { Bindings } from "../types.ts";

export const notebookRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

notebookRoutes.use("*", requireAuthentication);

const SUSPEND_HOURS: Record<string, number> = { tonight: 14, week: 24 * 7 };

function suspendedUntil(scope: string) {
  const hours = SUSPEND_HOURS[scope];

  if (hours) {
    return new Date(Date.now() + hours * 3_600_000).toISOString();
  }

  return scope === "forever" ? new Date(Date.now() + 3_650 * 86_400_000).toISOString() : null;
}

notebookRoutes.get("/", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const viewer = await readViewerContext(context.env.DB, user.id);

    await refreshBeliefs(context.env, user.id, viewer);

    const beliefs = await retryTransient(() => readBeliefs(context.env.DB, user.id));

    return jsonResponse({ beliefs, updatedAt: new Date().toISOString() });
  } catch (error) {
    logError("notebook_read_failed", error);

    return jsonResponse({ error: "The notebook is out of reach for a moment." }, 503);
  }
});

notebookRoutes.get("/guests", async (context) => {
  const user = context.get("authenticatedUser");

  return jsonResponse({ guests: await readGuests(context.env.DB, user.id) });
});

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

notebookRoutes.post("/guests", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";

  if (!name) {
    return jsonResponse({ error: "They will need a name." }, 400);
  }

  try {
    const id = typeof body?.id === "string" ? body.id : undefined;

    if (!id && (await guestCount(context.env.DB, user.id)) >= GUEST_LIMIT) {
      return jsonResponse({ error: "That is a full row already." }, 400);
    }

    await saveGuest(context.env.DB, user.id, {
      ...(id ? { id } : {}),
      name,
      vetoes: stringList(body?.vetoes),
      leanings: stringList(body?.leanings),
    });

    return jsonResponse({ guests: await readGuests(context.env.DB, user.id) });
  } catch (error) {
    logError("guest_save_failed", error);

    return jsonResponse({ error: "Could not note them down" }, 500);
  }
});

notebookRoutes.delete("/guests/:id", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    await removeGuest(context.env.DB, user.id, context.req.param("id"));

    return jsonResponse({ guests: await readGuests(context.env.DB, user.id) });
  } catch (error) {
    logError("guest_remove_failed", error);

    return jsonResponse({ error: "Could not remove them" }, 500);
  }
});

notebookRoutes.patch("/:id", async (context) => {
  const user = context.get("authenticatedUser");
  const beliefId = context.req.param("id");
  const body = await readJsonObject(context.req.raw);
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "forget") {
      const removed = await editBelief(context.env.DB, user.id, beliefId, { revoke: true });

      return removed ? jsonResponse({ forgotten: true }) : jsonResponse({ error: "Unknown" }, 404);
    }

    if (action === "restore") {
      const restored = await editBelief(context.env.DB, user.id, beliefId, {
        suspendedUntil: null,
      });

      return restored ? jsonResponse({ restored: true }) : jsonResponse({ error: "Unknown" }, 404);
    }

    if (action === "suspend") {
      const scope = typeof body?.scope === "string" ? body.scope : "";

      if (!isBeliefScope(scope) && scope !== "forever") {
        return jsonResponse({ error: "I do not know that scope" }, 400);
      }

      const suspended = await editBelief(context.env.DB, user.id, beliefId, {
        suspendedUntil: suspendedUntil(scope),
      });

      return suspended
        ? jsonResponse({ suspended: true })
        : jsonResponse({ error: "Unknown" }, 404);
    }

    if (action === "rewrite") {
      const value = typeof body?.value === "string" ? body.value.trim().slice(0, 160) : "";

      if (!value) {
        return jsonResponse({ error: "Write something, or forget it instead." }, 400);
      }

      const saved = await editBelief(context.env.DB, user.id, beliefId, { value });

      return saved ? jsonResponse({ saved: true }) : jsonResponse({ error: "Unknown" }, 404);
    }

    return jsonResponse({ error: "That is not something I can do to a note." }, 400);
  } catch (error) {
    logError("notebook_edit_failed", error);

    return jsonResponse({ error: "Could not change that" }, 500);
  }
});
