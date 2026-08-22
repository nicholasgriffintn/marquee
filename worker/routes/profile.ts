import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { getProfile, removeFromProfile, updateProfile } from "../services/profile.ts";
import type { Bindings } from "../types.ts";

export const profileRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

profileRoutes.use("*", requireAuthentication);

profileRoutes.get("/", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const profile = await getProfile(context.env.DB, user.id);

    return jsonResponse(profile);
  } catch (error) {
    logError("profile_read_failed", error);

    return jsonResponse({ error: "Profile unavailable" }, 500);
  }
});

profileRoutes.post("/", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!body) {
    return jsonResponse({ error: "Invalid or oversized JSON" }, 400);
  }

  try {
    const result = await updateProfile(context.env.DB, user.id, body);

    if (result.ok) {
      recordEvent(context.env, {
        name: "shelf_save",
        viewerId: user.id,
        titleId: typeof body.titleId === "string" ? body.titleId : undefined,
        detail: typeof body.status === "string" ? body.status : undefined,
      });
    }

    return result.ok ? jsonResponse(result.payload) : jsonResponse({ error: result.error }, 400);
  } catch (error) {
    logError("profile_write_failed", error);

    return jsonResponse({ error: "Could not save profile" }, 500);
  }
});

profileRoutes.delete("/:titleId", async (context) => {
  const user = context.get("authenticatedUser");
  const titleId = context.req.param("titleId");

  try {
    const deleted = await removeFromProfile(context.env.DB, user.id, titleId);

    if (deleted) {
      recordEvent(context.env, { name: "shelf_remove", viewerId: user.id, titleId });
    }

    return deleted
      ? jsonResponse({ deleted: true })
      : jsonResponse({ error: "Unknown title" }, 404);
  } catch (error) {
    logError("profile_delete_failed", error);

    return jsonResponse({ error: "Could not update profile" }, 500);
  }
});
