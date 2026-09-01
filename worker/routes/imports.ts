import { Hono } from "hono";

import { requireAuthentication, type AuthVariables } from "../auth/session.ts";
import { jsonResponse, readJsonObject, readJsonObjectWithLimit } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { queryInteger } from "../lib/params.ts";
import {
  appendViewerImportRecords,
  getViewerImport,
  getViewerImports,
  queueViewerImportCommit,
  queueViewerImportPreview,
  removeViewerImport,
  resolveViewerImportRecord,
  startViewerImport,
} from "../services/imports/index.ts";
import type { Bindings } from "../types.ts";

const RECORD_BODY_LIMIT = 160_000;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const importRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

importRoutes.use("*", requireAuthentication);

function validId(value: string) {
  return ID_PATTERN.test(value);
}

importRoutes.get("/", async (context) => {
  const user = context.get("authenticatedUser");

  return jsonResponse({ runs: await getViewerImports(context.env, user.id) });
});

importRoutes.post("/", async (context) => {
  const user = context.get("authenticatedUser");

  try {
    const result = await startViewerImport(
      context.env,
      user.id,
      await readJsonObject(context.req.raw),
    );

    return result.ok
      ? jsonResponse({ run: result.run }, 201)
      : jsonResponse({ error: result.error, code: result.code }, 400);
  } catch (error) {
    logError("viewer_import_create_failed", error);

    return jsonResponse({ error: "I could not open that import.", code: "import_failed" }, 500);
  }
});

importRoutes.get("/:id", async (context) => {
  const user = context.get("authenticatedUser");
  const runId = context.req.param("id");

  if (!validId(runId)) {
    return jsonResponse({ error: "Unknown import", code: "unknown_import" }, 404);
  }

  const detail = await getViewerImport(
    context.env,
    user.id,
    runId,
    queryInteger(context, "offset", 0, 0, 25_000),
  );

  return detail
    ? jsonResponse(detail)
    : jsonResponse({ error: "Unknown import", code: "unknown_import" }, 404);
});

importRoutes.post("/:id/records", async (context) => {
  const user = context.get("authenticatedUser");
  const runId = context.req.param("id");

  if (!validId(runId)) {
    return jsonResponse({ error: "Unknown import", code: "unknown_import" }, 404);
  }

  const body = await readJsonObjectWithLimit(context.req.raw, RECORD_BODY_LIMIT);
  const result = await appendViewerImportRecords(context.env, user.id, runId, body?.records);

  return result.ok
    ? jsonResponse(result)
    : jsonResponse({ error: result.error, code: result.code }, 400);
});

importRoutes.post("/:id/preview", async (context) => {
  const user = context.get("authenticatedUser");
  const runId = context.req.param("id");
  const queued = validId(runId) && (await queueViewerImportPreview(context.env, user.id, runId));

  return queued
    ? jsonResponse({ queued: true })
    : jsonResponse(
        { error: "That import is not ready to preview.", code: "import_not_ready" },
        409,
      );
});

importRoutes.patch("/:id/records/:recordId", async (context) => {
  const user = context.get("authenticatedUser");
  const runId = context.req.param("id");
  const recordId = context.req.param("recordId");
  const resolved =
    validId(runId) &&
    validId(recordId) &&
    (await resolveViewerImportRecord(
      context.env,
      user.id,
      runId,
      recordId,
      await readJsonObject(context.req.raw),
    ));

  return resolved
    ? jsonResponse({ resolved: true })
    : jsonResponse({ error: "That match could not be saved.", code: "invalid_match" }, 400);
});

importRoutes.post("/:id/commit", async (context) => {
  const user = context.get("authenticatedUser");
  const runId = context.req.param("id");
  const queued = validId(runId) && (await queueViewerImportCommit(context.env, user.id, runId));

  return queued
    ? jsonResponse({ queued: true })
    : jsonResponse(
        { error: "Resolve or ignore the remaining titles first.", code: "import_not_ready" },
        409,
      );
});

importRoutes.delete("/:id", async (context) => {
  const user = context.get("authenticatedUser");
  const runId = context.req.param("id");
  const removed = validId(runId) && (await removeViewerImport(context.env, user.id, runId));

  return removed
    ? jsonResponse({ removed: true })
    : jsonResponse({ error: "That import cannot be removed just now.", code: "import_busy" }, 409);
});
