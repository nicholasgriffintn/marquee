import { Hono } from "hono";

import { accessTier, admitted, REQUIREMENT_MESSAGES } from "../../src/domain/access.ts";
import { toCard } from "../../src/domain/revival.ts";
import { sessionPrincipal } from "../auth/session.ts";
import { edgeCache } from "../lib/cache.ts";
import { readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import {
  countApproved,
  countSearch,
  countShelf,
  readShelfPage,
  readVaultPage,
  isRevivalId,
  saveProgress,
  searchApproved,
} from "../repositories/revival.ts";
import {
  getBill,
  getResumeShelf,
  getScreening,
  getShelves,
  shelfSelector,
} from "../services/revival.ts";
import { viewerAccess } from "../services/viewer/access.ts";
import type { Bindings } from "../types.ts";

export const revivalRoutes = new Hono<{ Bindings: Bindings }>();

revivalRoutes.get("/vault", edgeCache(600), async (context) => {
  try {
    return context.json({ total: await countApproved(context.env.DB) });
  } catch (error) {
    logError("revival_vault_failed", error, { area: "revival" });

    return context.json({ total: 0 });
  }
});

revivalRoutes.get("/bill", edgeCache(300), async (context) => {
  try {
    return context.json(await getBill(context.env.DB));
  } catch (error) {
    logError("revival_bill_failed", error, { area: "revival" });

    return context.json({ bill: [], billDate: "", fetchedAt: "" });
  }
});

revivalRoutes.get("/shelves", edgeCache(300, { byAccess: true }), async (context) => {
  try {
    const access = await viewerAccess(context.env, context.req.raw);

    return context.json(await getShelves(context.env.DB, access));
  } catch (error) {
    logError("revival_shelves_failed", error, { area: "revival" });

    return context.json({ shelves: [], fetchedAt: "" });
  }
});

revivalRoutes.get("/resume", async (context) => {
  const principal = await sessionPrincipal(context.env, context.req.raw);

  context.header("cache-control", "no-store");

  if (!principal) {
    return context.json({ works: [] });
  }

  try {
    const access = await viewerAccess(context.env, context.req.raw);

    return context.json(await getResumeShelf(context.env.DB, principal.user.id, access));
  } catch (error) {
    logError("revival_resume_failed", error, { area: "revival" });

    return context.json({ works: [] });
  }
});

revivalRoutes.get("/search", async (context) => {
  const query = (context.req.query("q") ?? "").trim().slice(0, 80);

  if (query.length < 2) {
    return context.json({ works: [], query });
  }

  try {
    const access = await viewerAccess(context.env, context.req.raw);

    context.header(
      "cache-control",
      accessTier(access) ? "private, max-age=300" : "public, max-age=300",
    );

    const page = pageParam(context.req.query("page"));
    const [found, total] = await Promise.all([
      searchApproved(context.env.DB, query, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      countSearch(context.env.DB, query),
    ]);

    return context.json({
      works: admitted(found, access).map(toCard),
      query,
      page,
      pageSize: PAGE_SIZE,
      total,
      hasMore: page * PAGE_SIZE < total,
    });
  } catch (error) {
    logError("revival_search_failed", error, { area: "revival" });

    return context.json({ works: [], query });
  }
});

function pageParam(raw: string | undefined) {
  const page = Number(raw ?? "1");

  return Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

const PAGE_SIZE = 60;

revivalRoutes.get("/browse", edgeCache(300, { byAccess: true }), async (context) => {
  const page = pageParam(context.req.query("page"));

  try {
    const [works, total, access] = await Promise.all([
      readVaultPage(context.env.DB, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      countApproved(context.env.DB),
      viewerAccess(context.env, context.req.raw),
    ]);

    return context.json({
      works: admitted(works, access).map(toCard),
      page,
      pageSize: PAGE_SIZE,
      total,
      hasMore: page * PAGE_SIZE < total,
    });
  } catch (error) {
    logError("revival_browse_failed", error, { area: "revival" });

    return context.json({ works: [], page, pageSize: PAGE_SIZE, total: 0, hasMore: false });
  }
});

revivalRoutes.get("/shelf/:id", edgeCache(300, { byAccess: true }), async (context) => {
  const id = context.req.param("id");
  const selector = shelfSelector(id);
  const page = pageParam(context.req.query("page"));

  if (!selector) {
    return context.json({ error: "No such shelf" }, 404);
  }

  try {
    const [works, total, access] = await Promise.all([
      readShelfPage(context.env.DB, selector, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      countShelf(context.env.DB, selector),
      viewerAccess(context.env, context.req.raw),
    ]);

    return context.json({
      id,
      works: admitted(works, access).map(toCard),
      page,
      pageSize: PAGE_SIZE,
      total,
      hasMore: page * PAGE_SIZE < total,
    });
  } catch (error) {
    logError("revival_shelf_failed", error, { area: "revival", shelf: id });

    return context.json({ id, works: [], page, pageSize: PAGE_SIZE, total: 0, hasMore: false });
  }
});

revivalRoutes.get("/:workId", async (context) => {
  const workId = context.req.param("workId");

  if (!isRevivalId(workId)) {
    return context.json({ error: "Nothing showing under that name" }, 404);
  }

  const [principal, access] = await Promise.all([
    sessionPrincipal(context.env, context.req.raw),
    viewerAccess(context.env, context.req.raw),
  ]);

  try {
    context.header("cache-control", "no-store");

    const screening = await getScreening(context.env, workId, principal?.user.id ?? null, access);

    if (!screening) {
      return context.json({ error: "Nothing showing under that name" }, 404);
    }

    const requires = "requires" in screening ? screening.requires : null;

    if (requires) {
      return context.json({ error: REQUIREMENT_MESSAGES[requires], requires }, 403);
    }

    return context.json(screening);
  } catch (error) {
    logError("revival_screening_failed", error, { area: "revival", workId });

    return context.json({ error: "That screen is dark" }, 500);
  }
});

revivalRoutes.post("/:workId/progress", async (context) => {
  const workId = context.req.param("workId");
  const principal = await sessionPrincipal(context.env, context.req.raw);

  if (!principal) {
    return context.json({ error: "Sign in to keep your place" }, 401);
  }

  if (!isRevivalId(workId)) {
    return context.json({ error: "Nothing showing under that name" }, 404);
  }

  const body = await readJsonObject(context.req.raw);
  const position = Number(body?.positionSeconds);

  if (!Number.isFinite(position) || position < 0) {
    return context.json({ error: "That is not a position" }, 400);
  }

  try {
    await saveProgress(
      context.env.DB,
      principal.user.id,
      workId,
      Math.min(position, 86_400),
      body?.finished === true,
    );

    return context.json({ ok: true });
  } catch (error) {
    logError("revival_progress_failed", error, { area: "revival", workId });

    return context.json({ error: "Could not keep your place" }, 500);
  }
});
