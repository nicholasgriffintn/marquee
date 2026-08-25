import { Hono } from "hono";

import { isShelfSort, shelfStatus, SHELF_PAGE_SIZE } from "../../src/domain/shelf.ts";
import type { DiaryRow } from "../../src/lib/letterboxd.ts";
import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { queryInteger, queryText } from "../lib/params.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { calendarDate, isRecord } from "../lib/values.ts";
import { recentExitFor, recordSignal } from "../repositories/signals.ts";
import { importDiary } from "../services/import-letterboxd.ts";
import {
  getProfile,
  getProviderPreferences,
  getShelf,
  getViewingEntry,
  removeFromProfile,
  updateProfile,
  updateProviderPreferences,
} from "../services/profile.ts";
import type { Bindings } from "../types.ts";

const IMPORT_BATCH = 100;
const MAX_SHELF_PAGE = 500;
const GENRE_LIMIT = 60;
const QUERY_LIMIT = 80;

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

profileRoutes.get("/entry/:titleId", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const entry = await getViewingEntry(context.env.DB, user.id, context.req.param("titleId"));

    context.header("cache-control", "private, no-store");

    return jsonResponse({ entry });
  } catch (error) {
    logError("profile_entry_read_failed", error);

    return jsonResponse({ entry: null });
  }
});

profileRoutes.get("/shelf", async (context) => {
  const user = context.get("authenticatedUser");
  const sortParam = context.req.query("sort");

  try {
    const shelf = await getShelf(context.env.DB, user.id, {
      status: shelfStatus(context.req.query("status")),
      genre: queryText(context, "genre", GENRE_LIMIT) || null,
      query: queryText(context, "q", QUERY_LIMIT),
      sort: isShelfSort(sortParam) ? sortParam : "added",
      page: queryInteger(context, "page", 0, 0, MAX_SHELF_PAGE),
      pageSize: SHELF_PAGE_SIZE,
    });

    context.header("cache-control", "private, no-store");

    return jsonResponse(shelf);
  } catch (error) {
    logError("shelf_read_failed", error);

    return jsonResponse({ error: "Your shelf is out of reach for a moment." }, 503);
  }
});

profileRoutes.get("/providers", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const preferences = await getProviderPreferences(context.env.DB, user.id);

    return jsonResponse(preferences);
  } catch (error) {
    logError("provider_preferences_read_failed", error);

    return jsonResponse({ error: "Could not load your providers" }, 500);
  }
});

profileRoutes.post("/providers", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!body) {
    return jsonResponse({ error: "Invalid or oversized JSON" }, 400);
  }

  try {
    const preferences = await updateProviderPreferences(context.env.DB, user.id, body);

    return jsonResponse(preferences);
  } catch (error) {
    logError("provider_preferences_write_failed", error);

    return jsonResponse({ error: "Could not save your providers" }, 500);
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

      if (body.status === "watched" && isKnownTitle(body.titleId)) {
        context.executionCtx.waitUntil(creditJourney(context.env, user.id, body.titleId));
      }
    }

    return result.ok ? jsonResponse(result.payload) : jsonResponse({ error: result.error }, 400);
  } catch (error) {
    logError("profile_write_failed", error);

    return jsonResponse({ error: "Could not save profile" }, 500);
  }
});

async function creditJourney(env: Bindings, viewerId: string, titleId: string) {
  const exit = await recentExitFor(env.DB, viewerId, titleId);

  if (!exit) {
    return;
  }

  recordEvent(env, {
    name: "title_watched",
    viewerId,
    titleId,
    ...(exit.journeyId ? { journeyId: exit.journeyId } : {}),
    ...(exit.source ? { source: exit.source } : {}),
  });

  await recordSignal(env.DB, viewerId, {
    type: "watched",
    titleId,
    ...(exit.journeyId ? { journeyId: exit.journeyId } : {}),
    context: { source: exit.source },
    expiresInDays: 365,
  });
}

profileRoutes.post("/import/letterboxd", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  if (rows.length === 0 || rows.length > IMPORT_BATCH) {
    return jsonResponse({ error: `Send between 1 and ${IMPORT_BATCH} rows.` }, 400);
  }

  const clean = rows.flatMap((row): DiaryRow[] => {
    if (!isRecord(row) || typeof row.name !== "string" || !row.name.trim()) {
      return [];
    }

    const year = Number(row.year);
    const rating = Number(row.rating);

    return [
      {
        name: row.name.trim().slice(0, 160),
        year: Number.isInteger(year) && year > 1870 && year < 2100 ? year : null,
        rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
        watchedAt: calendarDate(row.watchedAt) ?? "",
      },
    ];
  });

  try {
    const outcome = await importDiary(context.env, user.id, clean);

    return jsonResponse(outcome);
  } catch (error) {
    logError("letterboxd_route_failed", error);

    return jsonResponse({ error: "That import did not take." }, 500);
  }
});

profileRoutes.delete("/:titleId", async (context) => {
  const user = context.get("authenticatedUser");
  const titleId = context.req.param("titleId");

  if (!isKnownTitle(titleId)) {
    return jsonResponse({ error: "Unknown title" }, 400);
  }

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
