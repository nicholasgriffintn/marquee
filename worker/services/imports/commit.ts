import { logEvent } from "../../lib/logging.ts";
import {
  completeImportRun,
  importRunTitleIds,
  markImportRecordsCommitted,
  readCommitRecords,
  readImportRun,
  transitionImportRun,
} from "../../repositories/import-runs.ts";
import {
  insertImportedActivityEvents,
  projectViewingTitle,
} from "../../repositories/viewing-events.ts";
import type { Bindings } from "../../types.ts";

const COMMIT_CHUNK = 50;

export async function commitViewerImport(env: Bindings, viewerId: string, runId: string) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run || (run.status !== "ready" && run.status !== "committing")) {
    return null;
  }

  if (run.status === "ready") {
    const claimed = await transitionImportRun(env.DB, viewerId, runId, ["ready"], "committing");

    if (!claimed) {
      return null;
    }
  }

  const records = await readCommitRecords(env.DB, viewerId, runId);
  const titleIds = new Set<string>();
  let committed = 0;

  for (let index = 0; index < records.length; index += COMMIT_CHUNK) {
    const wave = records.slice(index, index + COMMIT_CHUNK);

    // oxlint-disable-next-line no-await-in-loop -- bounded transactions make interrupted commits resumable
    await env.DB.transaction(async (transaction) => {
      for (const record of wave) {
        if (!record.titleId) {
          continue;
        }

        titleIds.add(record.titleId);
        // oxlint-disable-next-line no-await-in-loop -- event insertion order is deterministic per record
        await insertImportedActivityEvents(transaction, viewerId, runId, record.titleId, record);
      }

      await markImportRecordsCommitted(
        transaction,
        viewerId,
        runId,
        wave.map((record) => record.id),
      );
    });

    committed += wave.length;
  }

  for (const titleId of titleIds) {
    // oxlint-disable-next-line no-await-in-loop -- projections use isolated title transactions
    await projectViewingTitle(env.DB, viewerId, titleId);
  }

  await completeImportRun(env.DB, viewerId, runId, committed);
  logEvent("viewer_import_committed", {
    runId,
    source: run.source,
    committed,
    titles: titleIds.size,
  });

  return { committed, titleIds: [...titleIds] };
}

export async function reprojectRemovedImport(env: Bindings, viewerId: string, runId: string) {
  const titleIds = await importRunTitleIds(env.DB, viewerId, runId);

  return { titleIds };
}
