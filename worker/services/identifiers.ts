import { readTitleIdentifiers } from "../clients/wikidata-identifiers.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { writeTitleIdentifierRows } from "../repositories/catalog-external-ids.ts";
import {
  recordIdentifierSyncs,
  selectIdentifierCandidates,
} from "../repositories/title-identifiers.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 300;

export async function syncTitleIdentifiers(env: Bindings) {
  const pending = await selectIdentifierCandidates(env.DB, SAMPLE_SIZE);

  if (pending.length === 0) {
    return 0;
  }

  const matched = await readTitleIdentifiers(pending).catch((error: unknown) => {
    logError("wikidata_identifiers_failed", error);

    return null;
  });

  if (!matched) {
    return 0;
  }

  await writeTitleIdentifierRows(
    env.DB,
    [...matched].map(([titleId, identifiers]) => ({ titleId, identifiers })),
  );
  await recordIdentifierSyncs(
    env.DB,
    pending.map((ref) => ({
      titleId: ref.titleId,
      matched: matched.has(ref.titleId),
    })),
  );

  logEvent("title_identifiers_synced", {
    candidates: pending.length,
    matched: matched.size,
  });

  return matched.size;
}
