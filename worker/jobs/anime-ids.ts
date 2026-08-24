import { readAnimeListVersion, readAnimeMappings } from "../clients/fribb.ts";
import { logEvent } from "../lib/logging.ts";
import { storeAnimeIds } from "../repositories/enrichment.ts";
import {
  advanceImport,
  finishImport,
  readLastImport,
  readRunningImport,
  recordRejectedImport,
  startImport,
} from "../repositories/external-imports.ts";
import type { Bindings } from "../types.ts";

const SOURCE = "fribb";
const DATASET = "anime-ids";
const CHUNK = 500;
const BUDGET_MS = 20_000;
const MIN_RETAINED = 0.9;

export async function importAnimeIds(env: Bindings, offset = 0, force = false) {
  const version = await readAnimeListVersion();
  const last = await readLastImport(env.DB, SOURCE, DATASET);

  if (offset === 0 && !force && last?.version === version) {
    logEvent("anime_ids_unchanged", { source: SOURCE, version });

    return { skipped: true, version, reached: 0, total: last.mapped, written: 0, done: true };
  }

  const mappings = await readAnimeMappings();

  if (offset === 0 && last && mappings.length < Math.floor(last.mapped * MIN_RETAINED)) {
    const detail = `Upstream dropped to ${mappings.length} mappings from ${last.mapped}`;

    await recordRejectedImport(
      env.DB,
      SOURCE,
      DATASET,
      version,
      mappings.length,
      mappings.length,
      detail,
    );
    logEvent("anime_ids_rejected", { source: SOURCE, version, detail });

    return { rejected: true, version, reached: 0, total: mappings.length, written: 0, done: true };
  }

  const running = offset > 0 ? await readRunningImport(env.DB, SOURCE, DATASET) : null;
  const importId =
    running?.id ??
    (await startImport(env.DB, SOURCE, DATASET, version, mappings.length, mappings.length));
  const deadline = Date.now() + BUDGET_MS;
  let cursor = Math.max(0, offset);
  let written = 0;

  while (cursor < mappings.length && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop
    written += await storeAnimeIds(env.DB, mappings.slice(cursor, cursor + CHUNK));
    cursor += CHUNK;
  }

  const reached = Math.min(cursor, mappings.length);
  const done = reached >= mappings.length;

  await advanceImport(env.DB, importId, written);

  if (done) {
    await finishImport(env.DB, importId, "completed");
  }

  logEvent("anime_ids_imported", {
    source: SOURCE,
    version,
    offset,
    reached,
    total: mappings.length,
    written,
    done,
  });

  return { version, reached, total: mappings.length, written, done };
}
