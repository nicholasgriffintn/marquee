import { type Context, Hono } from "hono";

import { ROOMS } from "../../src/domain/screening-rooms.ts";
import {
  isRoomKind,
  isScreeningId,
  isScreeningStatus,
  type RoomSnapshot,
} from "../../src/domain/screening.ts";
import {
  attachViewer,
  guestIdentity,
  requireAdmin,
  requireViewer,
  type AuthVariables,
  type ViewerVariables,
} from "../auth/session.ts";
import type { ScreeningResult } from "../durable/screening.ts";
import { jsonResponse, readJsonObject, withCookies } from "../lib/http.ts";
import { randomHex } from "../lib/tokens.ts";
import { boundedString } from "../lib/values.ts";
import { listScreenings, recordScreening } from "../repositories/screenings.ts";
import type { Bindings } from "../types.ts";

export const screeningRoutes = new Hono<{
  Bindings: Bindings;
  Variables: ViewerVariables & AuthVariables;
}>();

screeningRoutes.use("*", attachViewer);

type ScreeningContext = Context<{
  Bindings: Bindings;
  Variables: ViewerVariables & AuthVariables;
}>;

const FAILURES: Record<
  Exclude<ScreeningResult, { ok: true }>["reason"],
  [string, 400 | 403 | 404 | 409]
> = {
  missing: ["No screening by that name. The doors may have come down.", 404],
  exists: ["That room is already taken.", 409],
  closed: ["The doors are shut. Nobody else is coming in.", 409],
  unknown_option: ["That is not one of the cinemas.", 400],
  forbidden: ["Only whoever opened the doors can shut them.", 403],
  full: ["The house is full.", 409],
  not_member: ["Get a ticket first.", 403],
};

function stub(env: Bindings, id: string) {
  return env.SCREENING.get(env.SCREENING.idFromName(id));
}

function viewerOf(context: ScreeningContext) {
  const viewer = context.get("viewer");

  if (viewer) {
    return { key: viewer.id, name: viewer.displayName, cookie: null };
  }

  const guest = guestIdentity(context.env, context.req.raw);

  return { key: guest.guestId, name: null, cookie: guest.cookie };
}

function respond(result: ScreeningResult, status = 200, cookie?: string | null) {
  if (!result.ok) {
    const [error, code] = FAILURES[result.reason];

    return jsonResponse({ error }, code);
  }

  return withCookies(jsonResponse({ room: result.room satisfies RoomSnapshot }, status), cookie);
}

screeningRoutes.post("/", requireAdmin, async (context) => {
  const user = context.get("authenticatedUser");
  const body = await readJsonObject(context.req.raw);

  if (!body || !isRoomKind(body.room)) {
    return jsonResponse({ error: "Say which room you are opening." }, 400);
  }

  const id = randomHex(8);
  const definition = ROOMS[body.room];
  const result = await stub(context.env, id).open({ id, definition, hostKey: user.id });

  if (result.ok) {
    await recordScreening(context.env, {
      id,
      kind: definition.kind,
      title: definition.title,
      path: definition.path,
      hostId: user.id,
      createdAt: result.room.createdAt,
    });
  }

  return respond(result, 201);
});

const LIST_LIMIT = 30;

screeningRoutes.get("/", requireAdmin, async (context) => {
  const entries = (await listScreenings(context.env)).slice(0, LIST_LIMIT);
  const rooms = await Promise.all(
    entries.map(async (entry) => {
      const result = await stub(context.env, entry.id).read(entry.hostId);

      if (!result.ok) {
        return null;
      }

      return {
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        path: entry.path,
        hostId: entry.hostId,
        createdAt: entry.createdAt,
        status: result.room.status,
        members: result.room.members.length,
        online: result.room.members.filter((member) => member.online).length,
      };
    }),
  );

  return jsonResponse({ rooms: rooms.filter((room) => room !== null) });
});

screeningRoutes.get("/:id", async (context) => {
  const id = context.req.param("id");

  if (!isScreeningId(id)) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const viewer = viewerOf(context);
  const result = await stub(context.env, id).read(viewer.key);

  return respond(result, 200, viewer.cookie);
});

screeningRoutes.post("/:id/join", async (context) => {
  const id = context.req.param("id");

  if (!isScreeningId(id)) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const body = await readJsonObject(context.req.raw);

  if (!body || typeof body.optionId !== "string") {
    return jsonResponse({ error: "Pick a cinema first." }, 400);
  }

  const viewer = viewerOf(context);
  const result = await stub(context.env, id).join(
    viewer.key,
    viewer.name,
    body.optionId,
    boundedString(body.name, 24),
  );

  return respond(result, 200, viewer.cookie);
});

screeningRoutes.patch("/:id", requireViewer, async (context) => {
  const id = context.req.param("id");

  if (!isScreeningId(id)) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const body = await readJsonObject(context.req.raw);

  if (!body || !isScreeningStatus(body.status)) {
    return jsonResponse({ error: "The doors are either open or shut." }, 400);
  }

  const user = context.get("authenticatedUser");

  return respond(await stub(context.env, id).setStatus(user.id, body.status));
});

screeningRoutes.post("/:id/torch", requireAdmin, async (context) => {
  const id = context.req.param("id");

  if (!isScreeningId(id)) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const user = context.get("authenticatedUser");

  return respond(await stub(context.env, id).takeTorch(user.id));
});

screeningRoutes.get("/:id/socket", async (context) => {
  const id = context.req.param("id");

  if (!isScreeningId(id)) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  if (context.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return jsonResponse({ error: "This door only takes sockets." }, 426);
  }

  const viewer = viewerOf(context);

  return stub(context.env, id).fetch("https://screening/socket", {
    headers: { upgrade: "websocket", "x-member-key": viewer.key },
  });
});
