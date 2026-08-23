import {
  reelPath,
  type RevivalKind,
  type RevivalMirrorState,
  type RevivalRightsBasis,
  type RevivalSource,
  type RevivalStatus,
  type RevivalWork,
} from "../../src/domain/revival.ts";

export type RevivalCandidate = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  kind: RevivalKind;
  runtimeSeconds: number | null;
  stillUrl: string | null;
  streamUrl: string;
  streamBytes: number | null;
  streamType: string;
  width: number | null;
  height: number | null;
  rightsBasis: RevivalRightsBasis;
  rightsNote: string;
  rightsUrl: string | null;
};

type WorkRow = {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  kind: string;
  runtimeSeconds: number | null;
  stillUrl: string | null;
  rightsBasis: string;
  rightsNote: string;
  rightsUrl: string | null;
  titleId: string | null;
  mirrorState: string;
  plays: number;
};

const WORK_COLUMNS = `id, source, source_url AS sourceUrl, title, year, director, synopsis,
   kind, runtime_seconds AS runtimeSeconds, still_url AS stillUrl,
   rights_basis AS rightsBasis, rights_note AS rightsNote, rights_url AS rightsUrl,
   title_id AS titleId, mirror_state AS mirrorState, plays`;

const ID_PATTERN = /^(archive|loc)\.[\w.-]{1,120}$/u;

export function isRevivalId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function isRevivalSource(value: unknown): value is RevivalSource {
  return value === "archive" || value === "loc";
}

export function revivalId(source: RevivalSource, sourceId: string) {
  return `${source}.${sourceId}`;
}

export function sortTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/u, "")
    .replaceAll(/[^a-z0-9\s]/gu, "")
    .trim()
    .slice(0, 120);
}

function toWork(row: WorkRow): RevivalWork {
  return {
    id: row.id,
    source: row.source as RevivalSource,
    sourceUrl: row.sourceUrl,
    title: row.title,
    year: row.year,
    director: row.director,
    synopsis: row.synopsis,
    kind: row.kind as RevivalKind,
    runtimeSeconds: row.runtimeSeconds,
    stillUrl: row.stillUrl,
    rightsBasis: row.rightsBasis as RevivalRightsBasis,
    rightsNote: row.rightsNote,
    rightsUrl: row.rightsUrl,
    titleId: row.titleId,
    mirrored: row.mirrorState === "mirrored",
    reelUrl: reelPath(row.id),
    plays: row.plays,
  };
}

export async function upsertWork(
  db: D1Database,
  source: RevivalSource,
  candidate: RevivalCandidate,
  status: RevivalStatus,
) {
  const id = revivalId(source, candidate.sourceId);

  await db
    .prepare(
      `INSERT INTO revival_works (
         id, source, source_id, source_url, title, sort_title, year, director, synopsis,
         kind, runtime_seconds, still_url, stream_url, stream_bytes, stream_type,
         width, height, rights_basis, rights_note, rights_url, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, source_id) DO UPDATE SET
         source_url = excluded.source_url,
         title = excluded.title,
         sort_title = excluded.sort_title,
         year = excluded.year,
         director = excluded.director,
         synopsis = excluded.synopsis,
         kind = excluded.kind,
         runtime_seconds = excluded.runtime_seconds,
         still_url = excluded.still_url,
         stream_url = excluded.stream_url,
         stream_bytes = excluded.stream_bytes,
         stream_type = excluded.stream_type,
         width = excluded.width,
         height = excluded.height,
         rights_basis = excluded.rights_basis,
         rights_note = excluded.rights_note,
         rights_url = excluded.rights_url,
         status = CASE
           WHEN revival_works.reviewed_at IS NOT NULL THEN revival_works.status
           ELSE excluded.status
         END,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      source,
      candidate.sourceId,
      candidate.sourceUrl,
      candidate.title,
      sortTitle(candidate.title),
      candidate.year,
      candidate.director,
      candidate.synopsis,
      candidate.kind,
      candidate.runtimeSeconds,
      candidate.stillUrl,
      candidate.streamUrl,
      candidate.streamBytes,
      candidate.streamType,
      candidate.width,
      candidate.height,
      candidate.rightsBasis,
      candidate.rightsNote,
      candidate.rightsUrl,
      status,
    )
    .run();

  return id;
}

export async function readApprovedWorks(db: D1Database, limit = 400) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       FROM revival_works
       WHERE status = 'approved'
       ORDER BY plays DESC, sort_title
       LIMIT ?`,
    )
    .bind(Math.min(limit, 800))
    .all<WorkRow>();

  return rows.results.map(toWork);
}

export async function readWork(db: D1Database, id: string) {
  const row = await db
    .prepare(`SELECT ${WORK_COLUMNS} FROM revival_works WHERE id = ? AND status = 'approved'`)
    .bind(id)
    .first<WorkRow>();

  return row ? toWork(row) : null;
}

export async function readWorksForTitle(db: D1Database, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       FROM revival_works
       WHERE title_id = ? AND status = 'approved'
       ORDER BY mirror_state = 'mirrored' DESC, runtime_seconds DESC
       LIMIT 4`,
    )
    .bind(titleId)
    .all<WorkRow>();

  return rows.results.map(toWork);
}

export type ReelTarget = {
  id: string;
  streamUrl: string;
  streamType: string;
  mirrorKey: string | null;
  mirrorState: RevivalMirrorState;
};

export async function readReelTarget(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT id, stream_url AS streamUrl, stream_type AS streamType,
              mirror_key AS mirrorKey, mirror_state AS mirrorState
       FROM revival_works
       WHERE id = ? AND status = 'approved'`,
    )
    .bind(id)
    .first<ReelTarget>();

  return row ?? null;
}

export async function recordPlay(db: D1Database, id: string) {
  await db.prepare(`UPDATE revival_works SET plays = plays + 1 WHERE id = ?`).bind(id).run();
}

type ReviewRow = WorkRow & {
  status: string;
  streamUrl: string;
  streamBytes: number | null;
  discoveredAt: string;
  mirrorError: string | null;
};

export async function listForReview(db: D1Database, status: RevivalStatus, limit = 60) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}, status, stream_url AS streamUrl, stream_bytes AS streamBytes,
              discovered_at AS discoveredAt, mirror_error AS mirrorError
       FROM revival_works
       WHERE status = ?
       ORDER BY discovered_at DESC
       LIMIT ?`,
    )
    .bind(status, Math.min(limit, 200))
    .all<ReviewRow>();

  return rows.results.map((row) => ({
    ...toWork(row),
    status: row.status as RevivalStatus,
    mirrorState: row.mirrorState as RevivalMirrorState,
    streamUrl: row.streamUrl,
    streamBytes: row.streamBytes,
    discoveredAt: row.discoveredAt,
    mirrorError: row.mirrorError,
  }));
}

export async function setWorkStatus(
  db: D1Database,
  id: string,
  status: RevivalStatus,
  reviewer: string,
) {
  const result = await db
    .prepare(
      `UPDATE revival_works
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(status, reviewer.slice(0, 120), id)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function selectUnmatched(db: D1Database, limit = 40) {
  const rows = await db
    .prepare(
      `SELECT id, title, year, runtime_seconds AS runtimeSeconds
       FROM revival_works
       WHERE status = 'approved'
         AND title_id IS NULL
         AND kind IN ('feature', 'short')
         AND (matched_at IS NULL OR matched_at < datetime('now', '-30 days'))
       ORDER BY discovered_at DESC
       LIMIT ?`,
    )
    .bind(Math.min(limit, 200))
    .all<{ id: string; title: string; year: number | null; runtimeSeconds: number | null }>();

  return rows.results;
}

export async function recordMatch(
  db: D1Database,
  id: string,
  titleId: string | null,
  confidence: number,
) {
  await db
    .prepare(
      `UPDATE revival_works
       SET title_id = ?, match_confidence = ?, matched_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(titleId, confidence, id)
    .run();
}

export async function selectUnmirrored(db: D1Database, limit = 5) {
  const rows = await db
    .prepare(
      `SELECT id
       FROM revival_works
       WHERE status = 'approved'
         AND mirror_state IN ('remote', 'copying')
       ORDER BY mirror_state = 'copying' DESC, plays DESC, discovered_at
       LIMIT ?`,
    )
    .bind(Math.min(limit, 50))
    .all<{ id: string }>();

  return rows.results.map((row) => row.id);
}

export type MirrorRow = {
  id: string;
  streamUrl: string;
  streamType: string;
  mirrorKey: string | null;
  mirrorState: RevivalMirrorState;
  mirrorUploadId: string | null;
  mirrorParts: string;
  mirrorOffset: number;
};

export async function readMirrorRow(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT id, stream_url AS streamUrl, stream_type AS streamType,
              mirror_key AS mirrorKey, mirror_state AS mirrorState,
              mirror_upload_id AS mirrorUploadId, mirror_parts AS mirrorParts,
              mirror_offset AS mirrorOffset
       FROM revival_works
       WHERE id = ? AND status = 'approved'`,
    )
    .bind(id)
    .first<MirrorRow>();

  return row ?? null;
}

export async function saveMirrorProgress(
  db: D1Database,
  id: string,
  patch: { key: string; uploadId: string; parts: string; offset: number },
) {
  await db
    .prepare(
      `UPDATE revival_works
       SET mirror_state = 'copying', mirror_key = ?, mirror_upload_id = ?,
           mirror_parts = ?, mirror_offset = ?, mirror_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(patch.key, patch.uploadId, patch.parts, patch.offset, id)
    .run();
}

export async function completeMirror(db: D1Database, id: string, key: string, bytes: number) {
  await db
    .prepare(
      `UPDATE revival_works
       SET mirror_state = 'mirrored', mirror_key = ?, mirror_upload_id = NULL,
           mirror_parts = '[]', mirror_offset = ?, mirror_error = NULL,
           mirrored_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(key, bytes, id)
    .run();
}

export async function failMirror(db: D1Database, id: string, reason: string) {
  await db
    .prepare(
      `UPDATE revival_works
       SET mirror_state = 'failed', mirror_upload_id = NULL, mirror_parts = '[]',
           mirror_offset = 0, mirror_error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(reason.slice(0, 300), id)
    .run();
}

export async function resetMirror(db: D1Database, id: string) {
  await db
    .prepare(
      `UPDATE revival_works
       SET mirror_state = 'remote', mirror_key = NULL, mirror_upload_id = NULL,
           mirror_parts = '[]', mirror_offset = 0, mirror_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(id)
    .run();
}

export async function readProgress(db: D1Database, viewerId: string, workId: string) {
  const row = await db
    .prepare(
      `SELECT position_seconds AS positionSeconds, finished
       FROM revival_progress
       WHERE viewer_id = ? AND work_id = ?`,
    )
    .bind(viewerId, workId)
    .first<{ positionSeconds: number; finished: number }>();

  return { positionSeconds: row?.positionSeconds ?? 0, finished: Boolean(row?.finished) };
}

export async function saveProgress(
  db: D1Database,
  viewerId: string,
  workId: string,
  positionSeconds: number,
  finished: boolean,
) {
  await db
    .prepare(
      `INSERT INTO revival_progress (viewer_id, work_id, position_seconds, finished)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(viewer_id, work_id) DO UPDATE SET
         position_seconds = excluded.position_seconds,
         finished = max(revival_progress.finished, excluded.finished),
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(viewerId, workId, Math.max(0, Math.floor(positionSeconds)), finished ? 1 : 0)
    .run();
}

export async function readViewerProgress(db: D1Database, viewerId: string, limit = 12) {
  const rows = await db
    .prepare(
      `SELECT w.id, p.position_seconds AS positionSeconds, p.finished
       FROM revival_progress AS p
       JOIN revival_works AS w ON w.id = p.work_id
       WHERE p.viewer_id = ? AND p.finished = 0 AND p.position_seconds > 30
         AND w.status = 'approved'
       ORDER BY p.updated_at DESC
       LIMIT ?`,
    )
    .bind(viewerId, Math.min(limit, 50))
    .all<{ id: string; positionSeconds: number; finished: number }>();

  return rows.results;
}

export async function recordSourceRun(
  db: D1Database,
  source: RevivalSource,
  cursor: string,
  counts: { seen: number; accepted: number; rejected: number },
) {
  await db
    .prepare(
      `INSERT INTO revival_source_runs (source, cursor, seen, accepted, rejected, ran_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(source) DO UPDATE SET
         cursor = excluded.cursor,
         seen = revival_source_runs.seen + excluded.seen,
         accepted = revival_source_runs.accepted + excluded.accepted,
         rejected = revival_source_runs.rejected + excluded.rejected,
         ran_at = CURRENT_TIMESTAMP`,
    )
    .bind(source, cursor, counts.seen, counts.accepted, counts.rejected)
    .run();
}

export async function readSourceCursor(db: D1Database, source: RevivalSource) {
  const row = await db
    .prepare(`SELECT cursor FROM revival_source_runs WHERE source = ?`)
    .bind(source)
    .first<{ cursor: string }>();

  return row?.cursor ?? "";
}

export async function readRevivalStats(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM revival_works) AS works,
         (SELECT count(*) FROM revival_works WHERE status = 'approved') AS approved,
         (SELECT count(*) FROM revival_works WHERE status = 'candidate') AS candidates,
         (SELECT count(*) FROM revival_works WHERE status = 'rejected') AS rejected,
         (SELECT count(*) FROM revival_works WHERE mirror_state = 'mirrored') AS mirrored,
         (SELECT count(*) FROM revival_works WHERE mirror_state = 'copying') AS copying,
         (SELECT count(*) FROM revival_works WHERE mirror_state = 'failed') AS mirrorFailed,
         (SELECT count(*) FROM revival_works WHERE title_id IS NOT NULL) AS matched,
         (SELECT coalesce(sum(mirror_offset), 0) FROM revival_works WHERE mirror_state = 'mirrored') AS mirroredBytes`,
    )
    .first<Record<string, number>>();

  return row ?? {};
}
