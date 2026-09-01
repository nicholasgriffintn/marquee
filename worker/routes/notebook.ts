import { Hono } from "hono";

import { preferredLanguage } from "../../src/domain/languages.ts";
import { isBeliefScope } from "../../src/domain/notebook.ts";
import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { sendAddressConfirmation } from "../clients/email.ts";
import { jsonResponse, readJsonObject } from "../lib/http.ts";
import { logError, logRejection } from "../lib/logging.ts";
import { retryTransient } from "../lib/retry.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { excerpt } from "../lib/text.ts";
import { stringList } from "../lib/values.ts";
import {
  readAlertEmail,
  readAlertSettings,
  setAlertSetting,
  stageAlertEmail,
} from "../repositories/alerts.ts";
import {
  editBelief,
  readBeliefEvidenceIds,
  readBeliefs,
  readFollowedPeople,
  setPersonFollow,
} from "../repositories/beliefs.ts";
import { cinemaExists, searchCinemas } from "../repositories/cinemas.ts";
import type { FeedKey } from "../repositories/feeds.ts";
import {
  mintFeedToken,
  readFeedKey,
  revokeFeedToken,
  storeFeedToken,
} from "../repositories/feeds.ts";
import {
  GUEST_LIMIT,
  guestCount,
  guestOwned,
  readGuests,
  removeGuest,
  saveGuest,
} from "../repositories/guests.ts";
import { hashState } from "../repositories/links.ts";
import {
  readNotebookPreferences,
  saveNotebookPreferences,
} from "../repositories/notebook-preferences.ts";
import { readNotesByIds } from "../repositories/notes.ts";
import { readViewerEntries } from "../repositories/viewer-context.ts";
import { ALERT_KINDS, isAlertKind } from "../services/alerts/types.ts";
import { refreshBeliefs } from "../services/beliefs.ts";
import { buildTasteMap } from "../services/taste-map.ts";
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
    const entries = await readViewerEntries(context.env.DB, user.id);

    await refreshBeliefs(context.env, user.id, entries);

    const beliefs = await retryTransient(() => readBeliefs(context.env.DB, user.id));

    return jsonResponse({ beliefs, updatedAt: new Date().toISOString() });
  } catch (error) {
    logError("notebook_read_failed", error);

    return jsonResponse({ error: "The notebook is out of reach for a moment." }, 503);
  }
});

const CONFIRM_MINUTES = 60;
const GUEST_TRAITS = 8;
const GUEST_TRAIT_LENGTH = 40;

function guestList(value: unknown) {
  return stringList(value, { limit: GUEST_TRAITS, itemLength: GUEST_TRAIT_LENGTH });
}

notebookRoutes.get("/preferences", async (context) => {
  const user = context.get("authenticatedUser");

  return jsonResponse(await readNotebookPreferences(context.env.DB, user.id));
});

notebookRoutes.get("/preferences/cinemas", async (context) => {
  const query = context.req.query("query")?.trim().slice(0, 120) ?? "";

  return jsonResponse({ cinemas: await searchCinemas(context.env.DB, query) });
});

notebookRoutes.post("/preferences", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const requestedCinemaId =
    typeof body?.preferredCinemaId === "string" ? body.preferredCinemaId.trim().slice(0, 160) : "";
  const requestedLocation =
    typeof body?.preferredLocation === "string" ? body.preferredLocation.trim().slice(0, 120) : "";
  const hasCinemaPreference = Boolean(requestedCinemaId || requestedLocation);

  if (hasCinemaPreference && (!requestedCinemaId || requestedLocation.length < 2)) {
    return jsonResponse({ error: "Choose both a location and a cinema." }, 400);
  }

  if (requestedCinemaId && !(await cinemaExists(context.env.DB, requestedCinemaId))) {
    return jsonResponse({ error: "That cinema is not in the directory." }, 400);
  }

  await saveNotebookPreferences(context.env.DB, user.id, {
    preferredCinemaId: requestedCinemaId || null,
    preferredLocation: requestedLocation || null,
    preferredLanguage: preferredLanguage(body?.preferredLanguage),
  });

  return jsonResponse(await readNotebookPreferences(context.env.DB, user.id));
});

notebookRoutes.get("/alerts", async (context) => {
  const user = context.get("authenticatedUser");
  const [address, settings] = await Promise.all([
    readAlertEmail(context.env.DB, user.id),
    readAlertSettings(context.env.DB, user.id),
  ]);

  return jsonResponse({
    email: address.email,
    verified: address.verified,
    kinds: ALERT_KINDS.map((kind) => ({ kind, enabled: settings.get(kind) !== false })),
  });
});

notebookRoutes.post("/alerts/email", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return jsonResponse({ error: "That is not an address I can post to." }, 400);
  }

  try {
    const token = crypto.randomUUID().replaceAll("-", "");
    const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);

    await stageAlertEmail(context.env.DB, user.id, email, await hashState(token), CONFIRM_MINUTES);
    await sendAddressConfirmation(
      context.env,
      email,
      `${origin}/api/auth/alert-email?token=${token}`,
    );

    return jsonResponse({ sent: true, email, verified: false });
  } catch (error) {
    logError("alert_email_stage_failed", error);

    return jsonResponse({ error: "I could not get word to that address." }, 502);
  }
});

notebookRoutes.post("/alerts/settings", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!isAlertKind(body?.kind)) {
    return jsonResponse({ error: "I do not send that sort of note." }, 400);
  }

  await setAlertSetting(context.env.DB, user.id, body.kind, body?.enabled !== false);

  const settings = await readAlertSettings(context.env.DB, user.id);

  return jsonResponse({
    kinds: ALERT_KINDS.map((kind) => ({ kind, enabled: settings.get(kind) !== false })),
  });
});

function feedPayload(origin: string, token: string | null, key: FeedKey | null) {
  return {
    subscribed: Boolean(key),
    createdAt: key?.createdAt ?? null,
    lastUsedAt: key?.lastUsedAt ?? null,
    calendarUrl: token ? `${origin}/feeds/${token}/diary.ics` : null,
    alertsUrl: token ? `${origin}/feeds/${token}/alerts.atom` : null,
  };
}

notebookRoutes.get("/feeds", async (context) => {
  const user = context.get("authenticatedUser");
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);

  return jsonResponse(feedPayload(origin, null, await readFeedKey(context.env.DB, user.id)));
});

notebookRoutes.post("/feeds", async (context) => {
  const user = context.get("authenticatedUser");
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const token = mintFeedToken();

  try {
    await storeFeedToken(context.env.DB, user.id, token);

    return jsonResponse(feedPayload(origin, token, await readFeedKey(context.env.DB, user.id)));
  } catch (error) {
    logError("feed_token_mint_failed", error);

    return jsonResponse({ error: "I could not cut you a key just now." }, 500);
  }
});

notebookRoutes.delete("/feeds", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    await revokeFeedToken(context.env.DB, user.id);

    return jsonResponse(
      feedPayload(canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN), null, null),
    );
  } catch (error) {
    logError("feed_token_revoke_failed", error);

    return jsonResponse({ error: "That key would not come off the ring." }, 500);
  }
});

notebookRoutes.get("/people", async (context) => {
  const user = context.get("authenticatedUser");

  return jsonResponse({ following: await readFollowedPeople(context.env.DB, user.id) });
});

notebookRoutes.post("/people", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";

  if (name.length < 2) {
    return jsonResponse({ error: "Give me a name to watch for." }, 400);
  }

  try {
    await setPersonFollow(context.env.DB, user.id, name, body?.follow !== false);

    return jsonResponse({ following: await readFollowedPeople(context.env.DB, user.id) });
  } catch (error) {
    logError("person_follow_failed", error);

    return jsonResponse({ error: "I could not write that down." }, 500);
  }
});

notebookRoutes.get("/map", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const schedule = (task: Promise<unknown>) => {
      const logged = logRejection(task, "taste_map_task_failed");

      try {
        context.executionCtx.waitUntil(logged);
      } catch {
        void logged;
      }
    };

    return jsonResponse(await buildTasteMap(context.env, user.id, { schedule }));
  } catch (error) {
    logError("taste_map_route_failed", error);

    return jsonResponse({ error: "I cannot lay the map out just now. Try again shortly." }, 503);
  }
});

notebookRoutes.get("/guests", async (context) => {
  const user = context.get("authenticatedUser");

  return jsonResponse({ guests: await readGuests(context.env.DB, user.id) });
});

notebookRoutes.post("/guests", async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";

  if (!name) {
    return jsonResponse({ error: "They will need a name." }, 400);
  }

  try {
    const requested = typeof body?.id === "string" ? body.id : undefined;
    const id =
      requested && (await guestOwned(context.env.DB, user.id, requested)) ? requested : undefined;

    if (!id && (await guestCount(context.env.DB, user.id)) >= GUEST_LIMIT) {
      return jsonResponse({ error: "That is a full row already." }, 400);
    }

    await saveGuest(context.env.DB, user.id, {
      ...(id ? { id } : {}),
      name,
      vetoes: guestList(body?.vetoes),
      leanings: guestList(body?.leanings),
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

const EVIDENCE_EXCERPT = 220;

notebookRoutes.get("/:id/evidence", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const ids = await readBeliefEvidenceIds(
      context.env.DB,
      user.id,
      context.req.param("id"),
      "note",
    );
    const notes = await readNotesByIds(context.env.DB, user.id, ids);

    return jsonResponse({
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        excerpt: excerpt(note.thoughts, EVIDENCE_EXCERPT),
        notedAt: note.notedAt,
      })),
    });
  } catch (error) {
    logError("belief_evidence_failed", error);

    return jsonResponse({ error: "I cannot lay hands on those notes just now." }, 503);
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
