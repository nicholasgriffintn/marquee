import type { ImportRecord } from "../../../src/domain/imports.ts";
import { normaliseTitle } from "../../../src/lib/string.ts";
import { findByImdbId, getItems } from "../../clients/tmdb.ts";
import { logEvent } from "../../lib/logging.ts";
import { isKnownTitle } from "../../lib/validation.ts";
import { searchCatalogue } from "../../repositories/catalog-search.ts";
import { storeItems } from "../../repositories/catalog-writer.ts";
import {
  readImportRunForProcessing,
  readPendingImportRecords,
  readRememberedImportMatch,
  refreshImportRunCounts,
  saveImportMatch,
  transitionImportRun,
} from "../../repositories/import-runs.ts";
import { markLinkSynced } from "../../repositories/links.ts";
import type { Bindings } from "../../types.ts";

const CANDIDATES = 6;

async function knownTitle(db: Database, titleId: string) {
  return Boolean(await db.first(`SELECT id FROM catalog_titles WHERE id = $1`, [titleId]));
}

async function hydrateTitle(env: Bindings, titleId: string) {
  if (await knownTitle(env.DB, titleId)) {
    return true;
  }

  const titles = await getItems(env, [titleId]);

  if (titles.length === 0) {
    return false;
  }

  await storeItems(env.DB, titles, new Date().toISOString());

  return true;
}

async function exactExternalId(env: Bindings, record: ImportRecord) {
  const ids = record.externalIds ?? {};

  if (ids.tmdb && record.mediaType) {
    const titleId = `${record.mediaType}:${ids.tmdb}`;

    if (isKnownTitle(titleId)) {
      return { titleId, method: "tmdb" as const };
    }
  }

  if (ids.imdb) {
    const row = await env.DB.first<{ titleId: string }>(
      `SELECT id AS "titleId" FROM catalog_titles WHERE imdb_id = $1 LIMIT 1`,
      [ids.imdb],
    );

    if (row) {
      return { titleId: row.titleId, method: "imdb" as const };
    }

    const titleId = await findByImdbId(env, ids.imdb);

    if (titleId && (await hydrateTitle(env, titleId))) {
      return { titleId, method: "imdb" as const };
    }
  }

  if (ids.tvdb) {
    const row = await env.DB.first<{ titleId: string }>(
      `SELECT title_id AS "titleId" FROM catalog_title_external_ids WHERE tvdb_id = $1 LIMIT 1`,
      [ids.tvdb],
    );

    if (row) {
      return { titleId: row.titleId, method: "tvdb" as const };
    }
  }

  return null;
}

async function hydrateExactTmdb(env: Bindings, record: ImportRecord, titleId: string) {
  if (await knownTitle(env.DB, titleId)) {
    return true;
  }

  if (!record.externalIds?.tmdb || !record.mediaType) {
    return false;
  }

  return hydrateTitle(env, titleId);
}

async function remembered(env: Bindings, viewerId: string, record: ImportRecord) {
  if (!record.providerItemId) {
    return null;
  }

  const row = await readRememberedImportMatch(
    env.DB,
    viewerId,
    record.source,
    record.sourceSubject,
    record.providerItemId,
  );

  return row && (await knownTitle(env.DB, row.titleId))
    ? { titleId: row.titleId, method: "remembered" as const }
    : null;
}

async function titleCandidates(env: Bindings, record: ImportRecord) {
  const candidates = await searchCatalogue(env.DB, {
    query: record.title,
    scope: "title",
    ...(record.mediaType ? { mediaType: record.mediaType } : {}),
    limit: CANDIDATES,
    matchAny: false,
  });
  const wanted = normaliseTitle(record.title);
  const exact = candidates.filter(
    (candidate) =>
      normaliseTitle(candidate.title) === wanted ||
      normaliseTitle(candidate.originalTitle) === wanted,
  );
  const wantedYear = record.year;
  const sameYear = wantedYear
    ? exact.filter(
        (candidate) => candidate.year !== null && Math.abs(candidate.year - wantedYear) <= 1,
      )
    : exact;
  const [only] = sameYear;

  if (sameYear.length === 1 && only) {
    return { titleId: only.id, method: "title_year" as const, candidates };
  }

  return { titleId: null, method: null, candidates };
}

async function matchRecord(env: Bindings, viewerId: string, record: ImportRecord) {
  const external = await exactExternalId(env, record);

  if (external && (await hydrateExactTmdb(env, record, external.titleId))) {
    return { status: "matched" as const, ...external };
  }

  const known = await remembered(env, viewerId, record);

  if (known) {
    return { status: "matched" as const, ...known };
  }

  const title = await titleCandidates(env, record);

  if (title.titleId && title.method) {
    return {
      status: "matched" as const,
      titleId: title.titleId,
      method: title.method,
    };
  }

  const candidateTitleIds = title.candidates.map((candidate) => candidate.id);

  return candidateTitleIds.length > 0
    ? { status: "review" as const, candidateTitleIds }
    : { status: "unmatched" as const };
}

export async function matchViewerImport(env: Bindings, runId: string) {
  const run = await readImportRunForProcessing(env.DB, runId);

  if (!run || (run.status !== "matching" && run.status !== "staging")) {
    return 0;
  }

  if (run.status === "staging") {
    await transitionImportRun(env.DB, run.viewerId, runId, ["staging"], "matching");
  }

  const records = await readPendingImportRecords(env.DB, run.viewerId, runId);
  const decided = new Map<string, Awaited<ReturnType<typeof matchRecord>>>();

  for (const record of records) {
    const key = record.providerItemId ? `${record.providerItemId}${record.mediaType ?? ""}` : "";
    // oxlint-disable-next-line no-await-in-loop -- upstream hydration and deterministic progress are sequential
    const match = decided.get(key) ?? (await matchRecord(env, run.viewerId, record));

    if (key) {
      decided.set(key, match);
    }

    // oxlint-disable-next-line no-await-in-loop -- record state must follow its match
    await saveImportMatch(env.DB, run.viewerId, record.id, match);
  }

  await refreshImportRunCounts(env.DB, run.viewerId, runId);

  if (run.source === "trakt") {
    await markLinkSynced(env, run.viewerId, "trakt");
  }

  logEvent("viewer_import_matched", {
    runId,
    source: run.source,
    adapterVersion: run.adapterVersion,
    records: records.length,
  });

  return records.length;
}
