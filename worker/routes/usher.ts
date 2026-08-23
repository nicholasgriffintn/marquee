import { Hono } from "hono";

import { isTonightOrder, isUsherSurface } from "../../src/domain/usher.ts";
import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { recordEvent } from "../lib/events.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import {
  readAnswers,
  readUsherRecord,
  writeUsherRecord,
  popularPeople,
  recordRailFeedback,
  searchPeople,
} from "../repositories/usher.ts";
import { pickToOrder } from "../services/usher-order.ts";
import { pickOne } from "../services/usher-pick.ts";
import {
  applyAnswer,
  afterAnswer,
  dismissMoment,
  markPrompted,
  nextMoment,
  skipQuestion,
} from "../services/usher.ts";
import type { Bindings } from "../types.ts";

export const usherRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

usherRoutes.use("*", requireAuthentication);

export function viewerHour(value: unknown) {
  const hour = Number(value);

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined;
}

function numberParam(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

usherRoutes.get("/state", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    context.header("cache-control", "no-store");

    const [record, answers] = await Promise.all([
      readUsherRecord(context.env.DB, user.id),
      readAnswers(context.env.DB, user.id),
    ]);
    const awayDays = record.lastSeenAt
      ? Math.floor((Date.now() - Date.parse(record.lastSeenAt)) / 86_400_000)
      : 0;

    await writeUsherRecord(context.env.DB, user.id, { lastSeenAt: new Date().toISOString() });

    return jsonResponse({
      status: record.status,
      answered: [...answers.keys()],
      awayDays: Number.isFinite(awayDays) && awayDays > 0 ? awayDays : 0,
    });
  } catch (error) {
    logError("usher_state_failed", error);

    return jsonResponse({ status: "dismissed", answered: [], awayDays: 0 });
  }
});

usherRoutes.get("/moment", async (context) => {
  const user = context.get("authenticatedUser");
  const surface = context.req.query("surface");

  if (!isUsherSurface(surface)) {
    return jsonResponse({ error: "Unknown surface" }, 400);
  }

  try {
    context.header("cache-control", "no-store");

    const moment = await nextMoment(context.env, user.id, surface, {
      railId: context.req.query("railId")?.slice(0, 80),
      railName: context.req.query("railName")?.slice(0, 80),
      titleId: isKnownTitle(context.req.query("titleId"))
        ? context.req.query("titleId")
        : undefined,
      query: context.req.query("query")?.slice(0, 120),
      savedCount: numberParam(context.req.query("savedCount")),
      unratedCount: numberParam(context.req.query("unratedCount")),
      awayDays: numberParam(context.req.query("awayDays")),
    });

    if (moment) {
      await markPrompted(context.env, user.id, moment);
      recordEvent(context.env, {
        name: "usher_shown",
        viewerId: user.id,
        detail: moment.kind,
      });
    }

    return jsonResponse({ moment });
  } catch (error) {
    logError("usher_moment_failed", error);

    return jsonResponse({ moment: null });
  }
});

usherRoutes.get("/people", async (context) => {
  const query = (context.req.query("query") ?? "").trim().slice(0, 60);

  try {
    context.header("cache-control", "no-store");

    return jsonResponse({
      people: query
        ? await searchPeople(context.env.DB, query, 8)
        : await popularPeople(context.env.DB, 10),
    });
  } catch (error) {
    logError("usher_people_failed", error);

    return jsonResponse({ people: [] });
  }
});

usherRoutes.post("/answer", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!body || typeof body.questionId !== "string") {
    return jsonResponse({ error: "Invalid answer" }, 400);
  }

  try {
    const result = await applyAnswer(context.env, user.id, body.questionId, body.answer);

    if (!result.ok) {
      return jsonResponse({ error: result.error }, 400);
    }

    await afterAnswer(context.env, user.id);
    recordEvent(context.env, {
      name: "usher_answered",
      viewerId: user.id,
      detail: body.questionId,
    });

    return jsonResponse({ saved: true, answer: result.answer });
  } catch (error) {
    logError("usher_answer_failed", error);

    return jsonResponse({ error: "Could not save that" }, 500);
  }
});

usherRoutes.post("/skip", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!body || typeof body.questionId !== "string") {
    return jsonResponse({ error: "Invalid question" }, 400);
  }

  try {
    await skipQuestion(context.env, user.id, body.questionId.slice(0, 40));

    return jsonResponse({ skipped: true });
  } catch (error) {
    logError("usher_skip_failed", error);

    return jsonResponse({ error: "Could not skip that" }, 500);
  }
});

usherRoutes.post("/dismiss", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const kind = typeof body?.kind === "string" ? body.kind.slice(0, 40) : "";
  const scope =
    body?.scope === "kind" || body?.scope === "all" ? (body.scope as "kind" | "all") : "once";

  try {
    await dismissMoment(context.env, user.id, kind, scope);
    recordEvent(context.env, {
      name: "usher_dismissed",
      viewerId: user.id,
      detail: `${kind}:${scope}`,
    });

    return jsonResponse({ dismissed: true });
  } catch (error) {
    logError("usher_dismiss_failed", error);

    return jsonResponse({ error: "Could not dismiss that" }, 500);
  }
});

usherRoutes.post("/feedback", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const railId = typeof body?.railId === "string" ? body.railId.slice(0, 80) : "";
  const verdict = body?.verdict === "bad" ? "bad" : "good";

  if (!railId) {
    return jsonResponse({ error: "Unknown shelf" }, 400);
  }

  try {
    await recordRailFeedback(context.env.DB, user.id, railId, verdict);
    recordEvent(context.env, {
      name: "rail_feedback",
      viewerId: user.id,
      detail: `${railId}:${verdict}`,
    });

    return jsonResponse({ recorded: true });
  } catch (error) {
    logError("usher_feedback_failed", error);

    return jsonResponse({ error: "Could not record that" }, 500);
  }
});

usherRoutes.post("/pick", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  try {
    const pick = await pickOne(context.env, user.id, {
      providerIds: validProviderIds(body?.providerIds),
      rejected: Array.isArray(body?.rejected) ? body.rejected.filter(isKnownTitle) : [],
      hour: viewerHour(body?.hour),
      isWeekend: body?.isWeekend === true,
    });

    if (!pick) {
      return jsonResponse({
        item: null,
        line: "Nothing left I would put my name to. Widen your services.",
      });
    }

    recordEvent(context.env, {
      name: "usher_pick",
      viewerId: user.id,
      titleId: pick.item.id,
    });

    return jsonResponse({ item: pick.item, line: pick.line });
  } catch (error) {
    logError("usher_pick_route_failed", error);

    return jsonResponse({ error: "I can't pick just now." }, 500);
  }
});

usherRoutes.post("/order", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!isTonightOrder(body?.order)) {
    return jsonResponse({ error: "I did not catch all of that. Ask me again." }, 400);
  }

  try {
    const result = await pickToOrder(context.env, user.id, body.order, {
      providerIds: validProviderIds(body?.providerIds),
      rejected: Array.isArray(body?.rejected) ? body.rejected.filter(isKnownTitle) : [],
      hour: viewerHour(body?.hour),
      isWeekend: body?.isWeekend === true,
    });

    if (!result) {
      return jsonResponse({
        pick: null,
        backups: [],
        line: "Not with those answers and those services. Widen one or the other.",
      });
    }

    recordEvent(context.env, {
      name: "usher_order",
      viewerId: user.id,
      titleId: result.pick.item.id,
      detail: `${body.order.company}:${body.order.length}:${body.order.mood}`,
    });

    return jsonResponse({ pick: result.pick, backups: result.backups, line: "" });
  } catch (error) {
    logError("usher_order_route_failed", error);

    return jsonResponse({ error: "I can't take orders just now." }, 500);
  }
});
