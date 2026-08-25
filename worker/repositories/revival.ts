import {
  printCondition,
  reelPath,
  type RevivalKind,
  type RevivalMirrorState,
  type RevivalRightsBasis,
  type RevivalSource,
  type RevivalStatus,
  type RevivalTag,
  type RevivalTagKind,
  type RevivalWork,
} from "../../src/domain/revival.ts";
import { contentNoticeFor } from "../lib/revival-notice.ts";

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
  country?: string | null;
  rightsBasis: RevivalRightsBasis;
  rightsNote: string;
  rightsUrl: string | null;
  popularity?: number | null;
  downloads?: number | null;
  tags?: RevivalTag[];
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
  country: string | null;
  ukClear: number;
  ukExpiresYear: number | null;
  streamUrl: string;
  mirrorState: string;
  plays: number;
  streamBytes: number | null;
  width: number | null;
  height: number | null;
  contentNotice: string | null;
  popularity: number | null;
  downloads: number | null;
  groupId: string | null;
  posterKey: string | null;
  catalogueBackdrop: string | null;
  cataloguePoster: string | null;
};

const WORK_COLUMNS = `w.id, w.source, w.source_url AS sourceUrl, w.title, w.year, w.director,
   w.synopsis,
   w.kind, w.runtime_seconds AS runtimeSeconds, w.still_url AS stillUrl,
   w.rights_basis AS rightsBasis, w.rights_note AS rightsNote, w.rights_url AS rightsUrl,
   w.title_id AS titleId, w.country, w.uk_clear AS ukClear,
   w.uk_expires_year AS ukExpiresYear, w.stream_url AS streamUrl,
   w.mirror_state AS mirrorState, w.plays, w.content_notice AS contentNotice,
   w.popularity, w.downloads, w.group_id AS groupId,
   w.stream_bytes AS streamBytes, w.width, w.height,
   t.poster_key AS posterKey,
   json_extract(t.payload, '$.backdropUrl') AS catalogueBackdrop,
   json_extract(t.payload, '$.posterUrl') AS cataloguePoster`;

const WORK_FROM = `FROM revival_works AS w LEFT JOIN catalog_titles AS t ON t.id = w.title_id`;

const UNSCORED_POPULARITY = 550;

const BY_STANDING = `w.plays DESC, COALESCE(w.popularity, ${UNSCORED_POPULARITY}) DESC, w.sort_title`;

const ID_PATTERN = /^(archive|loc|europeana)\.[\w.-]{1,120}$/u;

export function isRevivalId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function isRevivalSource(value: unknown): value is RevivalSource {
  return value === "archive" || value === "loc" || value === "europeana";
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

function artFor(row: WorkRow) {
  if (row.posterKey) {
    return `/media/${row.posterKey}`;
  }

  const catalogue = row.catalogueBackdrop ?? row.cataloguePoster;

  if (catalogue) {
    return catalogue;
  }

  return row.stillUrl ? `/media/reel/still/${row.id}` : null;
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
    stillUrl: artFor(row),
    rightsBasis: row.rightsBasis as RevivalRightsBasis,
    rightsNote: row.rightsNote,
    rightsUrl: row.rightsUrl,
    titleId: row.titleId,
    country: row.country,
    ukClear: row.ukClear === 1,
    ukExpiresYear: row.ukExpiresYear,
    mirrored: row.mirrorState === "mirrored",
    delivery: row.ukClear === 1 ? "mirror" : "source",
    // Playing directly from the source host (archive.org/Europeana/LoC) is not Marquee
    // "communicating the work to the public" under UK law — the browser fetches straight
    // from the third party's own server, and that party has already made its own call to
    // host it publicly. Marquee only takes on that responsibility itself once it copies the
    // work into its own R2 bucket, which is why the mirror is gated on uk_clear and this
    // fallback URL is not.
    reelUrl: row.ukClear === 1 ? reelPath(row.id) : row.streamUrl,
    plays: row.plays,
    popularity: row.popularity,
    downloads: row.downloads,
    groupId: row.groupId,
    streamBytes: row.streamBytes,
    height: row.height,
    condition: printCondition(row.streamBytes, row.runtimeSeconds, row.height),
    contentNotice: row.contentNotice ?? contentNoticeFor(row.title, row.synopsis),
    tags: [],
  };
}

type TagRow = { workId: string; kind: string; slug: string; label: string };

const TAG_CHUNK = 60;

export async function attachTags(db: D1Database, works: RevivalWork[]) {
  if (works.length === 0) {
    return works;
  }

  const byId = new Map<string, RevivalWork>(works.map((work) => [work.id, { ...work, tags: [] }]));
  const ids = [...byId.keys()];

  for (let index = 0; index < ids.length; index += TAG_CHUNK) {
    const wave = ids.slice(index, index + TAG_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const rows = await db
      .prepare(
        `SELECT work_id AS workId, kind, slug, label
         FROM revival_tags
         WHERE work_id IN (${wave.map(() => "?").join(",")})`,
      )
      .bind(...wave)
      .all<TagRow>();

    for (const row of rows.results) {
      byId.get(row.workId)?.tags.push({
        kind: row.kind as RevivalTagKind,
        slug: row.slug,
        label: row.label,
      });
    }
  }

  return works.map((work) => byId.get(work.id) ?? work);
}

export async function storeTags(db: D1Database, workId: string, tags: RevivalTag[]) {
  await db.prepare(`DELETE FROM revival_tags WHERE work_id = ?`).bind(workId).run();

  if (tags.length === 0) {
    return;
  }

  await db.batch(
    tags.map((tag) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO revival_tags (work_id, kind, slug, label) VALUES (?, ?, ?, ?)`,
        )
        .bind(workId, tag.kind, tag.slug, tag.label),
    ),
  );
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
         width, height, country, rights_basis, rights_note, rights_url, popularity, downloads,
         status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         country = excluded.country,
         rights_basis = excluded.rights_basis,
         rights_note = excluded.rights_note,
         rights_url = excluded.rights_url,
         popularity = COALESCE(excluded.popularity, revival_works.popularity),
         downloads = COALESCE(excluded.downloads, revival_works.downloads),
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
      candidate.country ?? null,
      candidate.rightsBasis,
      candidate.rightsNote,
      candidate.rightsUrl,
      candidate.popularity ?? null,
      candidate.downloads ?? null,
      status,
    )
    .run();

  if (candidate.tags) {
    await storeTags(db, id, candidate.tags);
  }

  return id;
}

export type RightsRow = {
  id: string;
  source: RevivalSource;
  year: number | null;
  director: string | null;
  rightsBasis: RevivalRightsBasis;
  imdbId: string | null;
  wikidataId: string | null;
};

export async function readUncheckedRights(db: D1Database, limit = 60) {
  const rows = await db
    .prepare(
      `SELECT w.id, w.source, w.year, w.director, w.rights_basis AS rightsBasis,
              t.imdb_id AS imdbId,
              json_extract(t.payload, '$.externalIds.wikidataId') AS wikidataId
       FROM revival_works AS w
       LEFT JOIN catalog_titles AS t ON t.id = w.title_id
       WHERE w.status <> 'rejected'
         AND (w.rights_checked_at IS NULL OR w.rights_checked_at < datetime('now', '-180 days'))
       ORDER BY w.rights_checked_at IS NOT NULL, w.discovered_at
       LIMIT ?`,
    )
    .bind(Math.min(limit, 200))
    .all<RightsRow>();

  return rows.results;
}

export async function storeUkRights(
  db: D1Database,
  id: string,
  verdict: { clear: boolean; expiresYear: number | null; basis: RevivalRightsBasis; note: string },
) {
  await db
    .prepare(
      `UPDATE revival_works
       SET uk_clear = ?,
           uk_expires_year = ?,
           rights_basis = ?,
           rights_note = ?,
           rights_checked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(verdict.clear ? 1 : 0, verdict.expiresYear, verdict.basis, verdict.note.slice(0, 400), id)
    .run();
}

export type ShelfSelector =
  | { of: "home" }
  | { of: "tag"; kind: RevivalTagKind; slug: string }
  | { of: "country"; country: string }
  | { of: "decade"; decade: number }
  | { of: "runtime"; min: number; max: number }
  | { of: "kind"; kind: RevivalKind };

function selectorClause(selector: ShelfSelector) {
  if (selector.of === "home") {
    const none: unknown[] = [];

    return { where: `w.country IN ('United Kingdom', 'Ireland')`, binds: none };
  }

  if (selector.of === "tag") {
    return {
      where: `EXISTS (
        SELECT 1 FROM revival_tags AS g
        WHERE g.work_id = w.id AND g.kind = ? AND g.slug = ?
      )`,
      binds: [selector.kind, selector.slug],
    };
  }

  if (selector.of === "country") {
    return { where: `w.country = ?`, binds: [selector.country] };
  }

  if (selector.of === "decade") {
    return {
      where: `w.kind = 'feature' AND w.year >= ? AND w.year < ?`,
      binds: [selector.decade, selector.decade + 10],
    };
  }

  if (selector.of === "runtime") {
    return {
      where: `w.runtime_seconds >= ? AND w.runtime_seconds < ?`,
      binds: [selector.min, selector.max],
    };
  }

  return { where: `w.kind = ?`, binds: [selector.kind] };
}

export async function readShelfPage(
  db: D1Database,
  selector: ShelfSelector,
  limit: number,
  offset = 0,
) {
  const { where, binds } = selectorClause(selector);
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved' AND w.group_primary = 1 AND ${where}
       ORDER BY ${BY_STANDING}
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, Math.min(Math.max(1, limit), 120), Math.max(0, offset))
    .all<WorkRow>();

  return rows.results.map(toWork);
}

export async function countShelf(db: D1Database, selector: ShelfSelector) {
  const { where, binds } = selectorClause(selector);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM revival_works AS w
       WHERE w.status = 'approved' AND w.group_primary = 1 AND ${where}`,
    )
    .bind(...binds)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function readVaultPage(db: D1Database, limit: number, offset = 0) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved' AND w.group_primary = 1
       ORDER BY ${BY_STANDING}
       LIMIT ? OFFSET ?`,
    )
    .bind(Math.min(Math.max(1, limit), 120), Math.max(0, offset))
    .all<WorkRow>();

  return rows.results.map(toWork);
}

export type ShelfGroup = { slug: string; label: string; size: number };

export async function readTagGroups(
  db: D1Database,
  kind: RevivalTagKind,
  limit: number,
  minimum: number,
) {
  const rows = await db
    .prepare(
      `SELECT g.slug, MIN(g.label) AS label, COUNT(*) AS size
       FROM revival_tags AS g
       JOIN revival_works AS w
         ON w.id = g.work_id AND w.status = 'approved' AND w.group_primary = 1
       WHERE g.kind = ?
       GROUP BY g.slug
       HAVING COUNT(*) >= ?
       ORDER BY size DESC, label
       LIMIT ?`,
    )
    .bind(kind, minimum, Math.min(limit, 40))
    .all<ShelfGroup>();

  return rows.results;
}

export async function readCountryGroups(db: D1Database, limit: number, minimum: number) {
  const rows = await db
    .prepare(
      `SELECT country AS slug, country AS label, COUNT(*) AS size
       FROM revival_works
       WHERE status = 'approved' AND group_primary = 1
         AND country IS NOT NULL AND country <> ''
       GROUP BY country
       HAVING COUNT(*) >= ?
       ORDER BY size DESC, country
       LIMIT ?`,
    )
    .bind(minimum, Math.min(limit, 40))
    .all<ShelfGroup>();

  return rows.results;
}

export async function readDecadeGroups(db: D1Database, limit: number, minimum: number) {
  const rows = await db
    .prepare(
      `SELECT (year / 10) * 10 AS slug, (year / 10) * 10 AS label, COUNT(*) AS size
       FROM revival_works
       WHERE status = 'approved' AND group_primary = 1
         AND kind = 'feature' AND year IS NOT NULL
       GROUP BY slug
       HAVING COUNT(*) >= ?
       ORDER BY size DESC, slug DESC
       LIMIT ?`,
    )
    .bind(minimum, Math.min(limit, 40))
    .all<{ slug: number; label: number; size: number }>();

  return rows.results.map((row) => ({
    slug: String(row.slug),
    label: String(row.label),
    size: row.size,
  }));
}

export async function drawFromShelf(db: D1Database, selector: ShelfSelector, offset: number) {
  const [work] = await readShelfPage(db, selector, 1, offset);

  return work ?? null;
}

export type GroupCandidate = {
  id: string;
  sortTitle: string;
  year: number | null;
  runtimeSeconds: number | null;
  popularity: number | null;
  streamBytes: number | null;
  height: number | null;
  plays: number;
};

export async function readGroupCandidates(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id, sort_title AS sortTitle, year, runtime_seconds AS runtimeSeconds,
              popularity, stream_bytes AS streamBytes, height, plays
       FROM revival_works
       WHERE status = 'approved'
       ORDER BY sort_title, runtime_seconds`,
    )
    .all<GroupCandidate>();

  return rows.results;
}

export async function storeGroups(
  db: D1Database,
  assignments: { id: string; groupId: string; primary: boolean }[],
) {
  if (assignments.length === 0) {
    return 0;
  }

  const written = await db.batch(
    assignments.map((entry) =>
      db
        .prepare(
          `UPDATE revival_works
           SET group_id = ?, group_primary = ?
           WHERE id = ?
             AND (group_id IS NOT ? OR group_primary IS NOT ?)`,
        )
        .bind(entry.groupId, entry.primary ? 1 : 0, entry.id, entry.groupId, entry.primary ? 1 : 0),
    ),
  );

  return written.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
}

export async function readGroupPrints(db: D1Database, groupId: string, excludeId: string) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.group_id = ?
         AND w.id <> ?
       ORDER BY w.group_primary DESC, COALESCE(w.popularity, 0) DESC
       LIMIT 8`,
    )
    .bind(groupId, excludeId)
    .all<WorkRow>();

  return rows.results.map(toWork);
}

export async function countApproved(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM revival_works
       WHERE status = 'approved' AND group_primary = 1`,
    )
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function readAlsoShowing(
  db: D1Database,
  workId: string,
  kind: RevivalKind,
  limit = 8,
) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.group_primary = 1
         AND w.kind = ?
         AND w.id <> ?
       ORDER BY ${BY_STANDING}
       LIMIT ?`,
    )
    .bind(kind, workId, Math.min(limit, 24))
    .all<WorkRow>();

  return attachTags(db, rows.results.map(toWork));
}

export async function countSearch(db: D1Database, query: string) {
  const like = `%${query.replaceAll(/[%_]/gu, "")}%`;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM revival_works AS w
       WHERE w.status = 'approved'
         AND w.group_primary = 1
         AND (
           w.title LIKE ?1
           OR w.sort_title LIKE ?1
           OR w.director LIKE ?1
           OR EXISTS (
             SELECT 1 FROM revival_tags AS g
             WHERE g.work_id = w.id AND g.label LIKE ?1
           )
         )`,
    )
    .bind(like)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function searchApproved(db: D1Database, query: string, limit = 60, offset = 0) {
  const like = `%${query.replaceAll(/[%_]/gu, "")}%`;
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.group_primary = 1
         AND (
           w.title LIKE ?1
           OR w.sort_title LIKE ?1
           OR w.director LIKE ?1
           OR EXISTS (
             SELECT 1 FROM revival_tags AS g
             WHERE g.work_id = w.id AND g.label LIKE ?1
           )
         )
       ORDER BY COALESCE(w.popularity, ${UNSCORED_POPULARITY}) DESC, w.sort_title
       LIMIT ?2 OFFSET ?3`,
    )
    .bind(like, Math.min(Math.max(1, limit), 120), Math.max(0, offset))
    .all<WorkRow>();

  return attachTags(db, rows.results.map(toWork));
}

export async function readWork(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT ${WORK_COLUMNS} ${WORK_FROM} WHERE w.id = ? AND w.status = 'approved'`,
    )
    .bind(id)
    .first<WorkRow>();

  if (!row) {
    return null;
  }

  const [work] = await attachTags(db, [toWork(row)]);

  return work ?? null;
}

export async function readWorksForTitle(db: D1Database, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.title_id = ? AND w.status = 'approved'
       ORDER BY w.mirror_state = 'mirrored' DESC, w.runtime_seconds DESC
       LIMIT 4`,
    )
    .bind(titleId)
    .all<WorkRow>();

  return attachTags(db, rows.results.map(toWork));
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
       WHERE id = ? AND status = 'approved' AND uk_clear = 1`,
    )
    .bind(id)
    .first<ReelTarget>();

  return row ?? null;
}

export async function readStillSource(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT still_url AS stillUrl FROM revival_works WHERE id = ? AND status = 'approved'`,
    )
    .bind(id)
    .first<{ stillUrl: string | null }>();

  return row?.stillUrl ?? null;
}

export async function selectArchiveForRecheck(db: D1Database, limit = 60) {
  const rows = await db
    .prepare(
      `SELECT source_id AS sourceId, id
       FROM revival_works
       WHERE source = 'archive'
       ORDER BY updated_at
       LIMIT ?`,
    )
    .bind(Math.min(limit, 200))
    .all<{ sourceId: string; id: string }>();

  return rows.results;
}

export async function deleteWork(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM revival_works WHERE id = ?`).bind(id).run();
}

export async function touchWork(db: D1Database, id: string) {
  await db
    .prepare(`UPDATE revival_works SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(id)
    .run();
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
      `SELECT ${WORK_COLUMNS}, w.status, w.stream_bytes AS streamBytes,
              w.discovered_at AS discoveredAt, w.mirror_error AS mirrorError
       ${WORK_FROM}
       WHERE w.status = ?
       ORDER BY w.discovered_at DESC
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

export async function selectUnmatched(db: D1Database, limit = 400) {
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
    .bind(Math.min(limit, 600))
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

export async function selectKnownSourceIds(
  db: D1Database,
  source: RevivalSource,
  sourceIds: string[],
  freshDays = 30,
) {
  if (sourceIds.length === 0) {
    return new Set<string>();
  }

  const slots = sourceIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT source_id AS sourceId
       FROM revival_works
       WHERE source = ?
         AND source_id IN (${slots})
         AND updated_at > datetime('now', ?)`,
    )
    .bind(source, ...sourceIds, `-${Math.max(1, Math.trunc(freshDays))} days`)
    .all<{ sourceId: string }>();

  return new Set(rows.results.map((row) => row.sourceId));
}

export async function refreshPopularity(
  db: D1Database,
  source: RevivalSource,
  entries: { sourceId: string; popularity: number | null; downloads: number | null }[],
) {
  const scored = entries.filter((entry) => entry.popularity !== null);

  if (scored.length === 0) {
    return 0;
  }

  await db.batch(
    scored.map((entry) =>
      db
        .prepare(
          `UPDATE revival_works SET popularity = ?, downloads = COALESCE(?, downloads)
           WHERE source = ? AND source_id = ?`,
        )
        .bind(entry.popularity, entry.downloads, source, entry.sourceId),
    ),
  );

  return scored.length;
}

export async function selectUnmirrored(db: D1Database, limit = 5) {
  const rows = await db
    .prepare(
      `SELECT id
       FROM revival_works
       WHERE status = 'approved'
         AND uk_clear = 1
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

export async function readWorksByIds(db: D1Database, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const wanted = ids.slice(0, 50);
  const rows = await db
    .prepare(
      `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.id IN (${wanted.map(() => "?").join(", ")})`,
    )
    .bind(...wanted)
    .all<WorkRow>();
  const byId = new Map(rows.results.map((row) => [row.id, toWork(row)]));

  return wanted.flatMap((id) => {
    const work = byId.get(id);

    return work ? [work] : [];
  });
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
         (SELECT count(*) FROM revival_works WHERE uk_clear = 1) AS ukClear,
         (SELECT count(*) FROM revival_works WHERE uk_clear = 0 AND rights_checked_at IS NOT NULL) AS ukUnknown,
         (SELECT coalesce(sum(mirror_offset), 0) FROM revival_works WHERE mirror_state = 'mirrored') AS mirroredBytes`,
    )
    .first<Record<string, number>>();

  return row ?? {};
}
