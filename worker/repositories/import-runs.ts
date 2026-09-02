import type {
  ImportCounts,
  ImportedActivity,
  ImportRecord,
  ImportRun,
  ImportRunStatus,
} from "../../src/domain/imports.ts";
import type { DatabaseTransaction } from "../database/types.ts";
import { isRecord } from "../lib/values.ts";

type RunRow = ImportCounts & {
  id: string;
  source: ImportRun["source"];
  sourceSubject: string;
  inputKind: ImportRun["inputKind"];
  adapterId: string;
  adapterVersion: number;
  status: ImportRunStatus;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type RecordRow = {
  id: string;
  source: ImportRecord["source"];
  sourceSubject: string;
  sourceEventId: string;
  eventTypes: unknown;
  providerItemId: string | null;
  mediaType: "movie" | "tv" | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  externalIds: unknown;
  season: number | null;
  episode: number | null;
  watchedAt: string | null;
  rating: number | null;
  matchStatus: ImportRecord["matchStatus"];
  titleId: string | null;
  matchMethod: ImportRecord["matchMethod"];
  candidateTitleIds: unknown;
  validationError: string | null;
};

const RUN_COLUMNS = `id,
  source,
  source_subject AS "sourceSubject",
  input_kind AS "inputKind",
  adapter_id AS "adapterId",
  adapter_version AS "adapterVersion",
  status,
  received,
  matched,
  review,
  skipped,
  duplicate,
  committed,
  failed,
  error_code AS "errorCode",
  error_detail AS "errorDetail",
  created_at AS "createdAt",
  updated_at AS "updatedAt",
  completed_at AS "completedAt"`;

const RECORD_COLUMNS = `r.id,
  runs.source,
  runs.source_subject AS "sourceSubject",
  r.source_event_id AS "sourceEventId",
  r.event_types AS "eventTypes",
  r.provider_item_id AS "providerItemId",
  r.media_type AS "mediaType",
  r.title,
  r.original_title AS "originalTitle",
  r.year,
  r.external_ids AS "externalIds",
  r.season_number AS season,
  r.episode_number AS episode,
  r.watched_at AS "watchedAt",
  r.rating,
  r.match_status AS "matchStatus",
  r.title_id AS "titleId",
  r.match_method AS "matchMethod",
  r.candidate_title_ids AS "candidateTitleIds",
  r.validation_error AS "validationError"`;

function jsonValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  return value;
}

function stringList(value: unknown) {
  const parsed = jsonValue(value);

  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function externalIds(value: unknown): NonNullable<ImportedActivity["externalIds"]> {
  const parsed = jsonValue(value);

  if (!isRecord(parsed)) {
    return {};
  }

  return {
    ...(typeof parsed.tmdb === "number" ? { tmdb: parsed.tmdb } : {}),
    ...(typeof parsed.imdb === "string" ? { imdb: parsed.imdb } : {}),
    ...(typeof parsed.tvdb === "number" ? { tvdb: parsed.tvdb } : {}),
  };
}

function toRecord(row: RecordRow): ImportRecord {
  return {
    id: row.id,
    source: row.source,
    sourceSubject: row.sourceSubject,
    sourceEventId: row.sourceEventId,
    eventTypes: stringList(row.eventTypes).filter(
      (event): event is ImportRecord["eventTypes"][number] =>
        event === "watchlist" ||
        event === "watching" ||
        event === "watched" ||
        event === "rated" ||
        event === "dropped",
    ),
    ...(row.providerItemId ? { providerItemId: row.providerItemId } : {}),
    ...(row.mediaType ? { mediaType: row.mediaType } : {}),
    title: row.title,
    ...(row.originalTitle ? { originalTitle: row.originalTitle } : {}),
    ...(row.year !== null ? { year: row.year } : {}),
    externalIds: externalIds(row.externalIds),
    ...(row.season !== null ? { season: row.season } : {}),
    ...(row.episode !== null ? { episode: row.episode } : {}),
    ...(row.watchedAt ? { watchedAt: row.watchedAt } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    matchStatus: row.matchStatus,
    titleId: row.titleId,
    matchMethod: row.matchMethod,
    candidateTitleIds: stringList(row.candidateTitleIds),
    validationError: row.validationError,
  };
}

export async function createImportRun(
  db: Database,
  viewerId: string,
  input: {
    source: ImportRun["source"];
    sourceSubject: string;
    inputKind: ImportRun["inputKind"];
    adapterId: string;
    adapterVersion: number;
    inputFingerprint: string;
  },
) {
  const id = crypto.randomUUID();
  const row = await db.first<RunRow>(
    `INSERT INTO viewer_import_runs
       (id, viewer_id, source, source_subject, input_kind, adapter_id, adapter_version, input_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (viewer_id, source, source_subject, input_fingerprint, adapter_id, adapter_version)
     DO UPDATE SET updated_at = viewer_import_runs.updated_at
     RETURNING ${RUN_COLUMNS}`,
    [
      id,
      viewerId,
      input.source,
      input.sourceSubject,
      input.inputKind,
      input.adapterId,
      input.adapterVersion,
      input.inputFingerprint,
    ],
  );

  if (!row) {
    throw new Error("Import run could not be created");
  }

  return row;
}

export async function listImportRuns(db: Database, viewerId: string, limit = 100) {
  const rows = await db.query<RunRow>(
    `SELECT ${RUN_COLUMNS}
       FROM viewer_import_runs
      WHERE viewer_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [viewerId, limit],
  );

  return rows.rows;
}

export function readImportRun(db: DatabaseTransaction, viewerId: string, runId: string) {
  return db.first<RunRow>(
    `SELECT ${RUN_COLUMNS}
       FROM viewer_import_runs
      WHERE id = $1 AND viewer_id = $2`,
    [runId, viewerId],
  );
}

export function readImportRunForProcessing(db: Database, runId: string) {
  return db.first<RunRow & { viewerId: string }>(
    `SELECT ${RUN_COLUMNS}, viewer_id AS "viewerId"
       FROM viewer_import_runs
      WHERE id = $1`,
    [runId],
  );
}

export async function readImportRecords(
  db: Database,
  viewerId: string,
  runId: string,
  limit = 100,
  offset = 0,
) {
  const rows = await db.query<RecordRow>(
    `SELECT ${RECORD_COLUMNS}
       FROM viewer_import_records AS r
       JOIN viewer_import_runs AS runs ON runs.id = r.run_id
      WHERE r.run_id = $1 AND r.viewer_id = $2
      ORDER BY
        CASE r.match_status WHEN 'review' THEN 0 WHEN 'unmatched' THEN 1 ELSE 2 END,
        r.created_at,
        r.id
      LIMIT $3 OFFSET $4`,
    [runId, viewerId, limit, offset],
  );

  return rows.rows.map(toRecord);
}

export async function readImportRecord(
  db: Database,
  viewerId: string,
  runId: string,
  recordId: string,
) {
  const row = await db.first<RecordRow>(
    `SELECT ${RECORD_COLUMNS}
       FROM viewer_import_records AS r
       JOIN viewer_import_runs AS runs ON runs.id = r.run_id
      WHERE r.id = $1 AND r.run_id = $2 AND r.viewer_id = $3`,
    [recordId, runId, viewerId],
  );

  return row ? toRecord(row) : null;
}

export async function readPendingImportRecords(db: Database, viewerId: string, runId: string) {
  const rows = await db.query<RecordRow>(
    `SELECT ${RECORD_COLUMNS}
       FROM viewer_import_records AS r
       JOIN viewer_import_runs AS runs ON runs.id = r.run_id
      WHERE r.run_id = $1 AND r.viewer_id = $2 AND r.match_status = 'pending'
      ORDER BY r.created_at, r.id`,
    [runId, viewerId],
  );

  return rows.rows.map(toRecord);
}

export async function stageImportRecords(
  db: Database,
  viewerId: string,
  runId: string,
  records: ImportedActivity[],
) {
  return db.transaction(async (transaction) => {
    const run = await readImportRun(transaction, viewerId, runId);

    if (!run || run.status !== "staging") {
      return null;
    }

    let written = 0;

    for (const record of records) {
      // oxlint-disable-next-line no-await-in-loop -- preserve deterministic input ordering and counts
      const result = await transaction.execute(
        `INSERT INTO viewer_import_records
           (id, run_id, viewer_id, source_event_id, event_types, provider_item_id, media_type,
            title, original_title, year, external_ids, season_number, episode_number, watched_at, rating)
         VALUES ($1, $2, $3, $4, CAST($5 AS jsonb), $6, $7, $8, $9, $10,
                 CAST($11 AS jsonb), $12, $13, $14, $15)
         ON CONFLICT (run_id, source_event_id) DO NOTHING`,
        [
          crypto.randomUUID(),
          runId,
          viewerId,
          record.sourceEventId,
          JSON.stringify(record.eventTypes),
          record.providerItemId ?? null,
          record.mediaType ?? null,
          record.title,
          record.originalTitle ?? null,
          record.year ?? null,
          JSON.stringify(record.externalIds ?? {}),
          record.season ?? null,
          record.episode ?? null,
          record.watchedAt ?? null,
          record.rating ?? null,
        ],
      );

      written += result.rowCount;
    }

    await transaction.execute(
      `UPDATE viewer_import_runs
          SET received = received + $1,
              duplicate = duplicate + $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND viewer_id = $4`,
      [written, records.length - written, runId, viewerId],
    );

    return { written, duplicate: records.length - written };
  });
}

export async function transitionImportRun(
  db: Database,
  viewerId: string,
  runId: string,
  from: readonly ImportRunStatus[],
  to: ImportRunStatus,
) {
  const result = await db.execute(
    `UPDATE viewer_import_runs
        SET status = $1,
            error_code = NULL,
            error_detail = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND viewer_id = $3
        AND status IN (${from.map((_, index) => `$${index + 4}`).join(",")})`,
    [to, runId, viewerId, ...from],
  );

  return result.rowCount > 0;
}

export async function saveImportMatch(
  db: Database,
  viewerId: string,
  recordId: string,
  match: {
    status: "matched" | "review" | "unmatched";
    titleId?: string;
    method?: NonNullable<ImportRecord["matchMethod"]>;
    candidateTitleIds?: string[];
  },
) {
  await db.execute(
    `UPDATE viewer_import_records
        SET match_status = $1,
            title_id = $2,
            match_method = $3,
            candidate_title_ids = CAST($4 AS jsonb),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND viewer_id = $6 AND match_status = 'pending'`,
    [
      match.status,
      match.titleId ?? null,
      match.method ?? null,
      JSON.stringify(match.candidateTitleIds ?? []),
      recordId,
      viewerId,
    ],
  );
}

export async function refreshImportRunCounts(db: Database, viewerId: string, runId: string) {
  const counts = await db.first<{
    matched: number;
    review: number;
    skipped: number;
    failed: number;
  }>(
    `SELECT
       count(*) FILTER (WHERE match_status = 'matched') AS matched,
       count(*) FILTER (WHERE match_status = 'review') AS review,
       count(*) FILTER (WHERE match_status IN ('unmatched', 'ignored')) AS skipped,
       count(*) FILTER (WHERE validation_error IS NOT NULL) AS failed
     FROM viewer_import_records
     WHERE run_id = $1 AND viewer_id = $2`,
    [runId, viewerId],
  );
  const matched = counts?.matched ?? 0;
  const review = counts?.review ?? 0;
  const status = review > 0 ? "needs_review" : matched > 0 ? "ready" : "completed";

  await db.execute(
    `UPDATE viewer_import_runs
        SET matched = $1, review = $2, skipped = $3, failed = $4,
            status = $5,
            completed_at = CASE
              WHEN $5 = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
              ELSE NULL
            END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND viewer_id = $7`,
    [matched, review, counts?.skipped ?? 0, counts?.failed ?? 0, status, runId, viewerId],
  );
}

export async function resolveImportRecord(
  db: Database,
  viewerId: string,
  runId: string,
  recordId: string,
  resolution: { titleId: string | null; ignore: boolean; providerItemId: string | null },
) {
  const result = await db.execute(
    `UPDATE viewer_import_records
        SET match_status = $1,
            title_id = $2,
            match_method = $3,
            candidate_title_ids = '[]'::jsonb,
            updated_at = CURRENT_TIMESTAMP
      WHERE run_id = $5 AND viewer_id = $6
        AND match_status IN ('review', 'unmatched')
        AND (id = $4 OR provider_item_id = $7)`,
    [
      resolution.ignore ? "ignored" : "matched",
      resolution.ignore ? null : resolution.titleId,
      resolution.ignore ? null : "manual",
      recordId,
      runId,
      viewerId,
      resolution.providerItemId,
    ],
  );

  return result.rowCount > 0;
}

export async function rememberImportMatch(
  db: Database,
  viewerId: string,
  source: string,
  sourceSubject: string,
  providerItemKey: string,
  titleId: string,
) {
  await db.execute(
    `INSERT INTO viewer_external_item_matches
       (viewer_id, source, source_subject, provider_item_key, title_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (viewer_id, source, source_subject, provider_item_key) DO UPDATE SET
       title_id = excluded.title_id,
       updated_at = CURRENT_TIMESTAMP`,
    [viewerId, source, sourceSubject, providerItemKey, titleId],
  );
}

export function readRememberedImportMatch(
  db: Database,
  viewerId: string,
  source: string,
  sourceSubject: string,
  providerItemKey: string,
) {
  return db.first<{ titleId: string }>(
    `SELECT title_id AS "titleId"
       FROM viewer_external_item_matches
      WHERE viewer_id = $1 AND source = $2 AND source_subject = $3 AND provider_item_key = $4`,
    [viewerId, source, sourceSubject, providerItemKey],
  );
}

export async function readCommitRecords(db: Database, viewerId: string, runId: string) {
  const rows = await db.query<RecordRow>(
    `SELECT ${RECORD_COLUMNS}
       FROM viewer_import_records AS r
       JOIN viewer_import_runs AS runs ON runs.id = r.run_id
      WHERE r.run_id = $1 AND r.viewer_id = $2 AND r.match_status = 'matched'
      ORDER BY r.created_at, r.id`,
    [runId, viewerId],
  );

  return rows.rows.map(toRecord);
}

export async function markImportRecordsCommitted(
  db: DatabaseTransaction,
  viewerId: string,
  runId: string,
  recordIds: string[],
) {
  if (recordIds.length === 0) {
    return;
  }

  await db.execute(
    `UPDATE viewer_import_records
        SET match_status = 'committed', updated_at = CURRENT_TIMESTAMP
      WHERE run_id = $1 AND viewer_id = $2
        AND id IN (SELECT value FROM jsonb_array_elements_text(CAST($3 AS jsonb)) AS records(value))`,
    [runId, viewerId, JSON.stringify(recordIds)],
  );
}

export async function recordImportCommit(
  db: Database,
  viewerId: string,
  runId: string,
  committed: number,
) {
  await db.execute(
    `UPDATE viewer_import_runs
        SET committed = committed + $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND viewer_id = $3`,
    [committed, runId, viewerId],
  );
}

export async function failImportRun(
  db: Database,
  viewerId: string,
  runId: string,
  code: string,
  detail: string,
) {
  await db.execute(
    `UPDATE viewer_import_runs
        SET status = 'failed', error_code = $1, error_detail = $2,
            updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND viewer_id = $4`,
    [code.slice(0, 80), detail.slice(0, 240), runId, viewerId],
  );
}

export function failImportRunForProcessing(
  db: DatabaseTransaction,
  runId: string,
  code: string,
  detail: string,
) {
  return db.execute(
    `UPDATE viewer_import_runs
        SET status = 'failed', error_code = $1, error_detail = $2,
            updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND status IN ('matching', 'committing')`,
    [code.slice(0, 80), detail.slice(0, 240), runId],
  );
}

export async function importRunTitleIds(db: Database, viewerId: string, runId: string) {
  const rows = await db.query<{ titleId: string }>(
    `SELECT DISTINCT title_id AS "titleId"
       FROM viewing_events
      WHERE viewer_id = $1 AND import_run_id = $2`,
    [viewerId, runId],
  );

  return rows.rows.map((row) => row.titleId);
}

export async function deleteImportRun(db: Database, viewerId: string, runId: string) {
  const result = await db.execute(
    `DELETE FROM viewer_import_runs WHERE id = $1 AND viewer_id = $2`,
    [runId, viewerId],
  );

  return result.rowCount > 0;
}

const ABANDONED_RUN_DAYS = 30;

const ABANDONED_STATUSES = ["staging", "matching", "ready", "needs_review", "failed"];

export async function pruneImportRuns(db: Database) {
  const statuses = ABANDONED_STATUSES.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.execute(
    `DELETE FROM viewer_import_runs
      WHERE status IN (${statuses})
        AND updated_at < (CURRENT_TIMESTAMP - CAST($${ABANDONED_STATUSES.length + 1} AS INTERVAL))
        AND NOT EXISTS (
          SELECT 1 FROM viewing_events WHERE import_run_id = viewer_import_runs.id
        )`,
    [...ABANDONED_STATUSES, `${ABANDONED_RUN_DAYS} days`],
  );

  return result.rowCount;
}
