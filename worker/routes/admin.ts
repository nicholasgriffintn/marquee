import { Hono } from "hono";

import { ADMIN_ACTIONS, isAdminAction } from "../../src/domain/admin.ts";
import { requireAdmin, type AuthVariables } from "../auth/session.ts";
import { runEvaluation } from "../evaluation/runner.ts";
import { readJsonObject } from "../lib/http.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { SOURCE_BUDGETS } from "../repositories/budgets.ts";
import { readDecisionBoard } from "../repositories/decisions.ts";
import {
  isRevivalId,
  listForReview,
  readRevivalStats,
  resetMirror,
  setWorkStatus,
} from "../repositories/revival.ts";
import { readOverviewSample } from "../services/admin-sample.ts";
import { setUserRole } from "../services/admin-users.ts";
import {
  clearSourcePause,
  listAdminUsers,
  readAdminListings,
  readAdminOverview,
  readAdminPipeline,
  runAdminAction,
} from "../services/admin.ts";
import { readAngleBoard } from "../services/angle-scores.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

export const adminRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

adminRoutes.use("*", requireAdmin);

adminRoutes.get("/overview", async (context) => {
  try {
    context.header("cache-control", "no-store");

    return context.json({
      ...(await readAdminOverview(context.env)),
      actions: ADMIN_ACTIONS,
    });
  } catch (error) {
    logError("admin_overview_failed", error, { area: "admin" });

    return context.json({ error: "Could not read the pipeline" }, 500);
  }
});

adminRoutes.get("/pipeline", async (context) => {
  try {
    context.header("cache-control", "no-store");

    return context.json(await readAdminPipeline(context.env));
  } catch (error) {
    logError("admin_pipeline_failed", error, { area: "admin" });

    return context.json({ error: "Could not read the pipeline" }, 500);
  }
});

adminRoutes.get("/listings", async (context) => {
  try {
    context.header("cache-control", "no-store");

    return context.json(await readAdminListings(context.env));
  } catch (error) {
    logError("admin_listings_failed", error, { area: "admin" });

    return context.json({ error: "Could not read the listings" }, 500);
  }
});

adminRoutes.get("/overview/sample/:type/:key", async (context) => {
  const type = context.req.param("type");
  const key = context.req.param("key");

  if (type !== "count" && type !== "budget") {
    return context.json({ error: "Unknown sample type" }, 400);
  }

  try {
    context.header("cache-control", "no-store");

    const sample = await readOverviewSample(context.env, type, key);

    if (!sample) {
      return context.json({ error: "No sample for that metric" }, 404);
    }

    return context.json({ type, key, ...sample });
  } catch (error) {
    logError("admin_sample_failed", error, { area: "admin", type, key });

    return context.json({ error: "Could not read a sample" }, 500);
  }
});

adminRoutes.post("/actions/:action", async (context) => {
  const action = context.req.param("action");

  if (!isAdminAction(action)) {
    return context.json({ error: "Unknown action" }, 400);
  }

  try {
    const result = await runAdminAction(context.env, action);

    logEvent("admin_action", {
      action,
      actor: context.get("authenticatedUser").githubLogin,
    });

    return context.json({ action, ...result });
  } catch (error) {
    logError("admin_action_failed", error, { area: "admin", action });

    return context.json(
      { error: error instanceof Error ? error.message : "That action could not be started" },
      500,
    );
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

adminRoutes.get("/revival", async (context) => {
  const requested = context.req.query("status") ?? "candidate";
  const status =
    requested === "approved" || requested === "rejected" || requested === "candidate"
      ? requested
      : "candidate";

  try {
    context.header("cache-control", "no-store");

    const [works, stats] = await Promise.all([
      listForReview(context.env.DB, status, 80),
      readRevivalStats(context.env.DB),
    ]);

    return context.json({ status, works, stats });
  } catch (error) {
    logError("admin_revival_failed", error, { area: "revival" });

    return context.json({ error: "Could not read the review queue" }, 500);
  }
});

adminRoutes.post("/revival/:workId/:decision", async (context) => {
  const workId = context.req.param("workId");
  const decision = context.req.param("decision");

  if (!isRevivalId(workId)) {
    return context.json({ error: "Unknown work" }, 404);
  }

  if (decision !== "approve" && decision !== "reject" && decision !== "mirror") {
    return context.json({ error: "Unknown decision" }, 400);
  }

  const actor = context.get("authenticatedUser");

  try {
    if (decision === "mirror") {
      await resetMirror(context.env.DB, workId);
      await context.env.REVIVAL_QUEUE.send({
        type: "mirror-revival-work",
        workId,
      });

      return context.json({ workId, decision, queued: true });
    }

    const changed = await setWorkStatus(
      context.env.DB,
      workId,
      decision === "approve" ? "approved" : "rejected",
      actor.githubLogin ?? actor.id,
    );

    if (changed && decision === "approve") {
      await context.env.REVIVAL_QUEUE.send({
        type: "mirror-revival-work",
        workId,
      });
    }

    return context.json({ workId, decision, changed });
  } catch (error) {
    logError("admin_revival_decision_failed", error, {
      area: "revival",
      workId,
    });

    return context.json({ error: "That decision did not stick" }, 500);
  }
});

adminRoutes.get("/quality", async (context) => {
  try {
    context.header("cache-control", "no-store");

    const [angles, decisions] = await Promise.all([
      readAngleBoard(context.env.DB),
      readDecisionBoard(context.env.DB),
    ]);

    return context.json({ angles, decisions, fetchedAt: new Date().toISOString() });
  } catch (error) {
    logError("admin_quality_failed", error, { area: "admin" });

    return context.json({ error: "Could not read the quality board" }, 500);
  }
});

adminRoutes.post("/quality/evaluate", async (context) => {
  try {
    context.header("cache-control", "no-store");

    return context.json(await runEvaluation(context.env));
  } catch (error) {
    logError("admin_evaluation_failed", error, { area: "admin" });

    return context.json({ error: "The fixture run did not finish" }, 500);
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
    return context.json({ error: result.error }, result.code === "not_found" ? 404 : 409);
  }

  return context.json({ users: await listAdminUsers(context.env) });
});
