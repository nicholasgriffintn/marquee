import {
  IMPORT_RECORD_BATCH_LIMIT,
  IMPORT_RECORD_LIMIT,
  IMPORT_RECORD_PAGE_LIMIT,
} from "../../../src/domain/imports.ts";
import { logEvent } from "../../lib/logging.ts";
import { isKnownTitle } from "../../lib/validation.ts";
import {
  createImportRun,
  deleteImportRun,
  listImportRuns,
  readImportRecord,
  readImportRecords,
  readImportRun,
  refreshImportRunCounts,
  rememberImportMatch,
  resolveImportRecord,
  stageImportRecords,
  transitionImportRun,
} from "../../repositories/import-runs.ts";
import { projectViewingTitle } from "../../repositories/viewing-events.ts";
import type { Bindings } from "../../types.ts";
import { getCatalogueItems } from "../catalog.ts";
import { reprojectRemovedImport } from "./commit.ts";
import { parseImportedActivity, parseImportRunInput } from "./validation.ts";

export async function startViewerImport(env: Bindings, viewerId: string, value: unknown) {
  const input = parseImportRunInput(value);

  if (!input) {
    return {
      ok: false as const,
      code: "invalid_import",
      error: "That import description is not valid.",
    };
  }

  const run = await createImportRun(env.DB, viewerId, input);

  logEvent("viewer_import_created", {
    runId: run.id,
    source: run.source,
    adapterVersion: run.adapterVersion,
    inputKind: run.inputKind,
  });

  return { ok: true as const, run };
}

export function getViewerImports(env: Bindings, viewerId: string) {
  return listImportRuns(env.DB, viewerId);
}

export async function getViewerImport(env: Bindings, viewerId: string, runId: string, offset = 0) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run) {
    return null;
  }

  const records = await readImportRecords(
    env.DB,
    viewerId,
    runId,
    IMPORT_RECORD_PAGE_LIMIT + 1,
    offset,
  );
  const page = records.slice(0, IMPORT_RECORD_PAGE_LIMIT);
  const titleIds = [
    ...new Set(
      page.flatMap((record) => [
        ...record.candidateTitleIds,
        ...(record.titleId ? [record.titleId] : []),
      ]),
    ),
  ];
  const catalogue = await getCatalogueItems(env.DB, titleIds, titleIds.length);

  return {
    run,
    records: page,
    titles: catalogue.items,
    recordPage: {
      offset,
      limit: IMPORT_RECORD_PAGE_LIMIT,
      hasMore: records.length > IMPORT_RECORD_PAGE_LIMIT,
    },
  };
}

export async function appendViewerImportRecords(
  env: Bindings,
  viewerId: string,
  runId: string,
  value: unknown,
) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run || run.status !== "staging") {
    return {
      ok: false as const,
      code: "unknown_import",
      error: "That import is not accepting records.",
    };
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > IMPORT_RECORD_BATCH_LIMIT) {
    return {
      ok: false as const,
      code: "invalid_records",
      error: `Send between 1 and ${IMPORT_RECORD_BATCH_LIMIT} records.`,
    };
  }

  if (run.received + value.length > IMPORT_RECORD_LIMIT) {
    return {
      ok: false as const,
      code: "import_too_large",
      error: `An import can contain at most ${IMPORT_RECORD_LIMIT.toLocaleString()} records.`,
    };
  }

  const records = value.map(parseImportedActivity);

  if (records.some((record) => record === null)) {
    return {
      ok: false as const,
      code: "invalid_records",
      error: "Some records are incomplete or invalid.",
    };
  }

  const clean = records.filter((record): record is NonNullable<typeof record> => record !== null);

  if (
    clean.some(
      (record) => record.source !== run.source || record.sourceSubject !== run.sourceSubject,
    )
  ) {
    return {
      ok: false as const,
      code: "source_mismatch",
      error: "Those records belong to a different source or profile.",
    };
  }

  const outcome = await stageImportRecords(env.DB, viewerId, runId, clean);

  return outcome
    ? { ok: true as const, ...outcome }
    : {
        ok: false as const,
        code: "unknown_import",
        error: "That import is not accepting records.",
      };
}

export async function queueViewerImportPreview(env: Bindings, viewerId: string, runId: string) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run || run.status !== "staging" || run.received === 0) {
    return false;
  }

  const claimed = await transitionImportRun(env.DB, viewerId, runId, ["staging"], "matching");

  if (!claimed) {
    return false;
  }

  await env.INGESTION_QUEUE.send({ type: "process-viewer-import", runId }, { contentType: "json" });

  return true;
}

export async function resolveViewerImportRecord(
  env: Bindings,
  viewerId: string,
  runId: string,
  recordId: string,
  value: unknown,
) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const ignore = input?.ignore === true;
  const titleId = isKnownTitle(input?.titleId) ? input.titleId : null;

  if (!ignore && !titleId) {
    return false;
  }

  if (titleId && !(await env.DB.first(`SELECT id FROM catalog_titles WHERE id = $1`, [titleId]))) {
    return false;
  }

  const record = await readImportRecord(env.DB, viewerId, runId, recordId);

  if (!record) {
    return false;
  }

  const resolved = await resolveImportRecord(env.DB, viewerId, runId, recordId, {
    titleId,
    ignore,
  });

  if (!resolved) {
    return false;
  }

  if (titleId && record.providerItemId) {
    await rememberImportMatch(
      env.DB,
      viewerId,
      record.source,
      record.sourceSubject,
      record.providerItemId,
      titleId,
    );
  }

  await refreshImportRunCounts(env.DB, viewerId, runId);

  return true;
}

export async function queueViewerImportCommit(env: Bindings, viewerId: string, runId: string) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run || run.status !== "ready") {
    return false;
  }

  await env.INGESTION_QUEUE.send(
    { type: "commit-viewer-import", runId, viewerId },
    { contentType: "json" },
  );

  return true;
}

export async function removeViewerImport(env: Bindings, viewerId: string, runId: string) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run || run.status === "committing") {
    return false;
  }

  const { titleIds } = await reprojectRemovedImport(env, viewerId, runId);

  if (!(await deleteImportRun(env.DB, viewerId, runId))) {
    return false;
  }

  for (const titleId of titleIds) {
    // oxlint-disable-next-line no-await-in-loop -- removal must rebuild each affected projection
    await projectViewingTitle(env.DB, viewerId, titleId);
  }

  logEvent("viewer_import_removed", { runId, source: run.source, titles: titleIds.length });

  return true;
}
