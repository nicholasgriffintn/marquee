import { logEvent } from "../../lib/logging.ts";
import {
  importRunTitleIds,
  markImportRecordsCommitted,
  readCommitRecords,
  readImportRun,
  recordImportCommit,
  refreshImportRunCounts,
  transitionImportRun,
} from "../../repositories/import-runs.ts";
import {
  importedActivityEvents,
  insertViewingEvents,
  projectViewingTitle,
} from "../../repositories/viewing-events.ts";
import type { Bindings } from "../../types.ts";

const COMMIT_CHUNK = 50;
const CLAIMABLE = ["ready", "needs_review"] as const;
const COMMITTABLE: ReadonlySet<string> = new Set([...CLAIMABLE, "committing"]);

export async function commitViewerImport(env: Bindings, viewerId: string, runId: string) {
  const run = await readImportRun(env.DB, viewerId, runId);

  if (!run || !COMMITTABLE.has(run.status)) {
    return null;
  }

  if (run.status !== "committing") {
    const claimed = await transitionImportRun(env.DB, viewerId, runId, CLAIMABLE, "committing");

    if (!claimed) {
      return null;
    }
  }

  const records = await readCommitRecords(env.DB, viewerId, runId);
  const titleIds = new Set<string>();
  let committed = 0;

  for (let index = 0; index < records.length; index += COMMIT_CHUNK) {
    const wave = records.slice(index, index + COMMIT_CHUNK);

    const entries = wave.flatMap((record) => {
      const titleId = record.titleId;

      if (!titleId) {
        return [];
      }

      titleIds.add(titleId);

      return importedActivityEvents(runId, record).map((event) => ({ titleId, event }));
    });

    // oxlint-disable-next-line no-await-in-loop -- bounded transactions make interrupted commits resumable
    await env.DB.transaction(async (transaction) => {
      await insertViewingEvents(transaction, viewerId, entries);
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

  await recordImportCommit(env.DB, viewerId, runId, committed);
  await refreshImportRunCounts(env.DB, viewerId, runId);
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
