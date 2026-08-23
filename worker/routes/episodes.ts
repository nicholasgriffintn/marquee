import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import {
  getShowProgress,
  markEpisodes,
  readViewerEpisodes,
  recordEpisodeEntry,
} from "../services/seasons.ts";
import type { Bindings } from "../types.ts";

const MAX_NOTES_LENGTH = 2_000;
const MAX_SEASON = 100;
const MAX_EPISODE = 2_000;

export const episodeRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

episodeRoutes.use("*", requireAuthentication);

function seriesId(value: unknown) {
  return isKnownTitle(value) && value.startsWith("tv:") ? value : null;
}

function counted(value: unknown, limit: number) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= limit ? parsed : null;
}

episodeRoutes.get("/", async (context) => {
  const user = context.get("authenticatedUser");
  const titleId = seriesId(context.req.query("titleId"));

  if (!titleId) {
    return jsonResponse({ error: "Unknown series" }, 400);
  }

  try {
    return jsonResponse(await readViewerEpisodes(context.env.DB, user.id, titleId));
  } catch (error) {
    logError("episode_entries_read_failed", error, { area: "seasons" });

    return jsonResponse({ error: "Your episode notes are out of reach for a moment." }, 503);
  }
});

episodeRoutes.post("/", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const titleId = seriesId(body?.titleId);
  const season = counted(body?.season, MAX_SEASON);
  const scope = body?.scope === "season" ? "season" : "episode";
  const episode = scope === "season" ? 0 : counted(body?.episode, MAX_EPISODE);

  if (!titleId || season === null || episode === null) {
    return jsonResponse({ error: "I do not know which episode you mean." }, 400);
  }

  const rating = body?.rating === null || body?.rating === undefined ? null : Number(body.rating);

  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return jsonResponse({ error: "Rating must be between 1 and 5" }, 400);
  }

  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, MAX_NOTES_LENGTH) : "";

  try {
    const entry = await recordEpisodeEntry(context.env.DB, user.id, {
      titleId,
      scope,
      season,
      episode,
      watched: body?.watched === true,
      rating,
      notes,
    });

    recordEvent(context.env, {
      name: "episode_save",
      viewerId: user.id,
      titleId,
      detail: `${scope}:${season}:${episode}`,
    });

    return jsonResponse({
      entry,
      progress: await getShowProgress(context.env.DB, user.id, titleId),
    });
  } catch (error) {
    logError("episode_entry_write_failed", error, { area: "seasons" });

    return jsonResponse({ error: "That did not stick. Try again." }, 500);
  }
});

episodeRoutes.post("/mark", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const titleId = seriesId(body?.titleId);
  const season = counted(body?.season, MAX_SEASON);
  const through = counted(body?.through, MAX_EPISODE);

  if (!titleId || season === null) {
    return jsonResponse({ error: "I do not know which series you mean." }, 400);
  }

  try {
    const marked = await markEpisodes(
      context.env,
      user.id,
      titleId,
      season,
      body?.watched !== false,
      through,
    );

    if (marked === null) {
      return jsonResponse({ error: "I could not find that series on the board." }, 404);
    }

    recordEvent(context.env, {
      name: "episode_mark",
      viewerId: user.id,
      titleId,
      detail: `${season}`,
      value: marked,
    });

    return jsonResponse({
      marked,
      ...(await readViewerEpisodes(context.env.DB, user.id, titleId)),
    });
  } catch (error) {
    logError("episode_mark_failed", error, { area: "seasons" });

    return jsonResponse({ error: "That did not stick. Try again." }, 500);
  }
});
