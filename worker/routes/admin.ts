import { Hono } from "hono";

import { requireAdmin, type AuthVariables } from "../auth/session.ts";
import { readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { SOURCE_BUDGETS } from "../repositories/budgets.ts";
import {
  ADMIN_ACTIONS,
  clearSourcePause,
  isAdminAction,
  listAdminUsers,
  readAdminOverview,
  runAdminAction,
  setUserRole,
} from "../services/admin.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

adminRoutes.use("*", requireAdmin);

adminRoutes.get("/overview", async (context) => {
  try {
    context.header("cache-control", "no-store");

    return context.json({ ...(await readAdminOverview(context.env)), actions: ADMIN_ACTIONS });
  } catch (error) {
    logError("admin_overview_failed", error, { area: "admin" });

    return context.json({ error: "Could not read the pipeline" }, 500);
  }
});

adminRoutes.post("/actions/:action", async (context) => {
  const action = context.req.param("action");

  if (!isAdminAction(action)) {
    return context.json({ error: "Unknown action" }, 400);
  }

  try {
    const result = await runAdminAction(context.env, action);

    console.log(
      JSON.stringify({
        event: "admin_action",
        action,
        actor: context.get("authenticatedUser").githubLogin,
      }),
    );

    return context.json({ action, ...result });
  } catch (error) {
    logError("admin_action_failed", error, { area: "admin", action });

    return context.json({ error: "That action could not be started" }, 500);
  }
});

adminRoutes.post("/sources/:source/resume", async (context) => {
  const source = context.req.param("source");

  if (!Object.hasOwn(SOURCE_BUDGETS, source)) {
    return context.json({ error: "Unknown source" }, 400);
  }

  try {
    return context.json(await clearSourcePause(context.env, source as EnrichmentSource));
  } catch (error) {
    logError("admin_resume_failed", error, { area: "admin", source });

    return context.json({ error: "Could not resume that source" }, 500);
  }
});

adminRoutes.get("/users", async (context) => {
  try {
    context.header("cache-control", "no-store");

    return context.json({ users: await listAdminUsers(context.env) });
  } catch (error) {
    logError("admin_users_failed", error, { area: "admin" });

    return context.json({ error: "Could not read the user list" }, 500);
  }
});

adminRoutes.post("/users/:id/role", async (context) => {
  const id = context.req.param("id");
  const body = await readJsonObject(context.req.raw);
  const role = body?.role ?? null;

  if (role !== "admin" && role !== "viewer") {
    return context.json({ error: "Role has to be admin or viewer" }, 400);
  }

  const result = await setUserRole(context.env, id, role);

  if (!result.ok) {
    return context.json({ error: result.error }, 409);
  }

  return context.json({ users: await listAdminUsers(context.env) });
});
