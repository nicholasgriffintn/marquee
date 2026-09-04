import type { ContentGate } from "../../src/domain/access.ts";
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
import { contentNoticeFor, revivalGateFor } from "../lib/revival-notice.ts";

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
  synopsisSource: string | null;
  synopsisArticle: string | null;
  synopsisUrl: string | null;
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
  catalogueCertification: string | null;
  posterKey: string | null;
  catalogueBackdrop: string | null;
  cataloguePoster: string | null;
};

const WORK_COLUMNS = `w.id, w.source, w.source_url AS "sourceUrl", w.title, w.year, w.director,
   w.synopsis, w.synopsis_source AS "synopsisSource",
   w.synopsis_article AS "synopsisArticle", w.synopsis_url AS "synopsisUrl",
   w.kind, w.runtime_seconds AS "runtimeSeconds", w.still_url AS "stillUrl",
   w.rights_basis AS "rightsBasis", w.rights_note AS "rightsNote", w.rights_url AS "rightsUrl",
   w.title_id AS "titleId", w.country, w.uk_clear AS "ukClear",
   w.uk_expires_year AS "ukExpiresYear", w.stream_url AS "streamUrl",
   w.mirror_state AS "mirrorState", w.plays, w.content_notice AS "contentNotice",
   w.popularity, w.downloads, w.group_id AS "groupId",
   w.stream_bytes AS "streamBytes", w.width, w.height,
   t.certification AS "catalogueCertification",
   t.poster_key AS "posterKey",
   t.backdrop_url AS "catalogueBackdrop",
   t.poster_url AS "cataloguePoster"`;

const WORK_FROM = `FROM revival_works AS w LEFT JOIN catalog_titles AS t ON t.id = w.title_id`;

const UNSCORED_POPULARITY = 550;

const BY_STANDING = `w.plays DESC, COALESCE(w.popularity, ${UNSCORED_POPULARITY}) DESC, w.sort_title`;

const ID_PATTERN = /^(archive|loc|europeana|wikidata)\.[\w.-]{1,120}$/u;

export function isRevivalId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function isRevivalSource(value: unknown): value is RevivalSource {
  return value === "archive" || value === "loc" || value === "europeana" || value === "wikidata";
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
  const contentNotice = row.contentNotice ?? contentNoticeFor(row.title, row.synopsis);

  return {
    id: row.id,
    source: row.source as RevivalSource,
    sourceUrl: row.sourceUrl,
    title: row.title,
    year: row.year,
    director: row.director,
    synopsis: row.synopsis,
    synopsisCredit:
      row.synopsisSource === "wikipedia" && row.synopsisArticle && row.synopsisUrl
        ? { article: row.synopsisArticle, url: row.synopsisUrl }
        : null,
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
    reelUrl: row.ukClear === 1 ? reelPath(row.id) : row.streamUrl,
    plays: row.plays,
    popularity: row.popularity,
    downloads: row.downloads,
    groupId: row.groupId,
    streamBytes: row.streamBytes,
    height: row.height,
    condition: printCondition(row.streamBytes, row.runtimeSeconds, row.height),
    contentNotice,
    gate: revivalGateFor({ contentNotice, certification: row.catalogueCertification }),
    tags: [],
  };
}

type TagRow = { workId: string; kind: string; slug: string; label: string };

const TAG_CHUNK = 60;

export async function attachTags(db: Database, works: RevivalWork[]) {
  if (works.length === 0) {
    return works;
  }

  const byId = new Map<string, RevivalWork>(works.map((work) => [work.id, { ...work, tags: [] }]));
  const ids = [...byId.keys()];

  for (let index = 0; index < ids.length; index += TAG_CHUNK) {
    const wave = ids.slice(index, index + TAG_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const rows = await db.query<TagRow>(
      `SELECT work_id AS "workId", kind, slug, label
         FROM revival_tags
         WHERE work_id IN (${wave.map((_, position) => `$${position + 1}`).join(",")})`,
      [...wave],
    );

    for (const row of rows.rows) {
      byId.get(row.workId)?.tags.push({
        kind: row.kind as RevivalTagKind,
        slug: row.slug,
        label: row.label,
      });
    }
  }

  return works.map((work) => byId.get(work.id) ?? work);
}

export async function storeTags(db: Database, workId: string, tags: RevivalTag[]) {
  await db.execute(`DELETE FROM revival_tags WHERE work_id = $1`, [workId]);

  if (tags.length === 0) {
    return;
  }

  await db.transaction(async (transaction) => {
    for (const tag of tags) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO revival_tags (work_id, kind, slug, label) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [workId, tag.kind, tag.slug, tag.label],
      );
    }
  });
}

export async function upsertWork(
  db: Database,
  source: RevivalSource,
  candidate: RevivalCandidate,
  status: RevivalStatus,
) {
  const id = revivalId(source, candidate.sourceId);

  await db.execute(
    `INSERT INTO revival_works (
         id, source, source_id, source_url, title, sort_title, year, director, synopsis,
         kind, runtime_seconds, still_url, stream_url, stream_bytes, stream_type,
         width, height, country, rights_basis, rights_note, rights_url, popularity, downloads,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       ON CONFLICT(source, source_id) DO UPDATE SET
         source_url = excluded.source_url,
         title = excluded.title,
         sort_title = excluded.sort_title,
         year = excluded.year,
         director = excluded.director,
         synopsis = CASE
           WHEN revival_works.synopsis_source IS NULL THEN excluded.synopsis
           ELSE revival_works.synopsis
         END,
         kind = excluded.kind,
         runtime_seconds = excluded.runtime_seconds,
         still_url = COALESCE(excluded.still_url, revival_works.still_url),
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
    [
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
    ],
  );

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

export async function readUncheckedRights(db: Database, limit = 60) {
  const rows = await db.query<RightsRow>(
    `SELECT w.id, w.source, w.year, w.director, w.rights_basis AS "rightsBasis",
              t.imdb_id AS "imdbId",
              COALESCE(
                t.wikidata_id,
                CASE WHEN w.source = 'wikidata' THEN w.source_id END
              ) AS "wikidataId"
       FROM revival_works AS w
       LEFT JOIN catalog_titles AS t ON t.id = w.title_id
       WHERE w.status <> 'rejected'
         AND (w.rights_checked_at IS NULL OR w.rights_checked_at < (CURRENT_TIMESTAMP - INTERVAL '180 day'))
       ORDER BY w.rights_checked_at IS NOT NULL, w.discovered_at
       LIMIT $1`,
    [Math.min(limit, 200)],
  );

  return rows.rows;
}

export async function storeUkRights(
  db: Database,
  id: string,
  verdict: {
    clear: boolean;
    expiresYear: number | null;
    basis: RevivalRightsBasis;
    note: string;
  },
) {
  await db.execute(
    `UPDATE revival_works
       SET uk_clear = $1,
           uk_expires_year = $2,
           rights_basis = $3,
           rights_note = $4,
           rights_checked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
    [verdict.clear ? 1 : 0, verdict.expiresYear, verdict.basis, verdict.note.slice(0, 400), id],
  );
}

export type DescriptionRow = {
  id: string;
  title: string;
  year: number | null;
  kind: RevivalKind;
  synopsis: string;
  catalogueArticle: string | null;
};

export const THIN_SYNOPSIS = 80;

export async function selectForDescription(db: Database, limit = 40) {
  const rows = await db.query<DescriptionRow>(
    `SELECT w.id, w.title, w.year, w.kind, w.synopsis, b.article AS "catalogueArticle"
       FROM revival_works AS w
       LEFT JOIN title_buzz AS b ON b.title_id = w.title_id AND b.article <> ''
       WHERE w.status = 'approved'
         AND length(trim(w.synopsis)) < $1
         AND (w.described_at IS NULL OR w.described_at < (CURRENT_TIMESTAMP - INTERVAL '180 day'))
       ORDER BY w.described_at IS NOT NULL, COALESCE(w.popularity, 0) DESC
       LIMIT $2`,
    [THIN_SYNOPSIS, Math.min(Math.max(1, limit), 200)],
  );

  return rows.rows;
}

export type ArticleDescription = { synopsis: string; article: string; articleUrl: string };

export async function storeDescription(db: Database, id: string, found: ArticleDescription | null) {
  await db.execute(
    `UPDATE revival_works
       SET synopsis = COALESCE($2, synopsis),
           synopsis_source = CASE WHEN $2 IS NULL THEN synopsis_source ELSE 'wikipedia' END,
           synopsis_article = COALESCE($3, synopsis_article),
           synopsis_url = COALESCE($4, synopsis_url),
           described_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
    [id, found?.synopsis ?? null, found?.article ?? null, found?.articleUrl ?? null],
  );
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
    const none: DatabaseValue[] = [];

    return { where: `w.country IN ('United Kingdom', 'Ireland')`, binds: none };
  }

  if (selector.of === "tag") {
    return {
      where: `EXISTS (
        SELECT 1 FROM revival_tags AS g
        WHERE g.work_id = w.id AND g.kind = $1 AND g.slug = $2
      )`,
      binds: [selector.kind, selector.slug],
    };
  }

  if (selector.of === "country") {
    return { where: `w.country = $1`, binds: [selector.country] };
  }

  if (selector.of === "decade") {
    return {
      where: `w.kind = 'feature' AND w.year >= $1 AND w.year < $2`,
      binds: [selector.decade, selector.decade + 10],
    };
  }

  if (selector.of === "runtime") {
    return {
      where: `w.runtime_seconds >= $1 AND w.runtime_seconds < $2`,
      binds: [selector.min, selector.max],
    };
  }

  return { where: `w.kind = $1`, binds: [selector.kind] };
}

export async function readShelfPage(
  db: Database,
  selector: ShelfSelector,
  limit: number,
  offset = 0,
) {
  const { where, binds } = selectorClause(selector);
  const limitParameter = binds.length + 1;
  const offsetParameter = limitParameter + 1;
  const rows = await db.query<WorkRow>(
    `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved' AND w.group_primary = 1 AND ${where}
       ORDER BY ${BY_STANDING}
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    [...binds, Math.min(Math.max(1, limit), 120), Math.max(0, offset)],
  );

  return rows.rows.map(toWork);
}

export async function countShelf(db: Database, selector: ShelfSelector) {
  const { where, binds } = selectorClause(selector);
  const row = await db.first<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM revival_works AS w
       WHERE w.status = 'approved' AND w.group_primary = 1 AND ${where}`,
    [...binds],
  );

  return row?.total ?? 0;
}

export async function readVaultPage(db: Database, limit: number, offset = 0) {
  const rows = await db.query<WorkRow>(
    `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved' AND w.group_primary = 1
       ORDER BY ${BY_STANDING}
       LIMIT $1 OFFSET $2`,
    [Math.min(Math.max(1, limit), 120), Math.max(0, offset)],
  );

  return rows.rows.map(toWork);
}

export type ShelfGroup = { slug: string; label: string; size: number };

export async function readTagGroups(
  db: Database,
  kind: RevivalTagKind,
  limit: number,
  minimum: number,
) {
  const rows = await db.query<ShelfGroup>(
    `SELECT g.slug, MIN(g.label) AS label, COUNT(*) AS size
       FROM revival_tags AS g
       JOIN revival_works AS w
         ON w.id = g.work_id AND w.status = 'approved' AND w.group_primary = 1
       WHERE g.kind = $1
       GROUP BY g.slug
       HAVING COUNT(*) >= $2
       ORDER BY size DESC, label
       LIMIT $3`,
    [kind, minimum, Math.min(limit, 40)],
  );

  return rows.rows;
}

export async function readCountryGroups(db: Database, limit: number, minimum: number) {
  const rows = await db.query<ShelfGroup>(
    `SELECT country AS slug, country AS label, COUNT(*) AS size
       FROM revival_works
       WHERE status = 'approved' AND group_primary = 1
         AND country IS NOT NULL AND country <> ''
       GROUP BY country
       HAVING COUNT(*) >= $1
       ORDER BY size DESC, country
       LIMIT $2`,
    [minimum, Math.min(limit, 40)],
  );

  return rows.rows;
}

export async function readDecadeGroups(db: Database, limit: number, minimum: number) {
  const rows = await db.query<{ slug: number; label: number; size: number }>(
    `SELECT (year / 10) * 10 AS slug, (year / 10) * 10 AS label, COUNT(*) AS size
       FROM revival_works
       WHERE status = 'approved' AND group_primary = 1
         AND kind = 'feature' AND year IS NOT NULL
       GROUP BY slug
       HAVING COUNT(*) >= $1
       ORDER BY size DESC, slug DESC
       LIMIT $2`,
    [minimum, Math.min(limit, 40)],
  );

  return rows.rows.map((row) => ({
    slug: String(row.slug),
    label: String(row.label),
    size: row.size,
  }));
}

export async function drawFromShelf(db: Database, selector: ShelfSelector, offset: number) {
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

export async function readGroupCandidates(db: Database) {
  const rows =
    await db.query<GroupCandidate>(`SELECT id, sort_title AS "sortTitle", year, runtime_seconds AS "runtimeSeconds",
              popularity, stream_bytes AS "streamBytes", height, plays
       FROM revival_works
       WHERE status = 'approved'
       ORDER BY sort_title, runtime_seconds`);

  return rows.rows;
}

export async function storeGroups(
  db: Database,
  assignments: { id: string; groupId: string; primary: boolean }[],
) {
  if (assignments.length === 0) {
    return 0;
  }

  const result = await db.execute(
    `UPDATE revival_works AS w
       SET group_id = assigned.group_id, group_primary = assigned.group_primary
       FROM (VALUES ${assignments
         .map(
           (_entry, row) =>
             `($${row * 3 + 1}::text, $${row * 3 + 2}::text, $${row * 3 + 3}::integer)`,
         )
         .join(", ")}) AS assigned(id, group_id, group_primary)
       WHERE w.id = assigned.id
         AND (w.group_id IS DISTINCT FROM assigned.group_id
              OR w.group_primary IS DISTINCT FROM assigned.group_primary)`,
    assignments.flatMap((entry) => [entry.id, entry.groupId, entry.primary ? 1 : 0]),
  );

  return result.rowCount;
}

export async function readGroupPrints(db: Database, groupId: string, excludeId: string) {
  const rows = await db.query<WorkRow>(
    `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.group_id = $1
         AND w.id <> $2
       ORDER BY w.group_primary DESC, COALESCE(w.popularity, 0) DESC
       LIMIT 8`,
    [groupId, excludeId],
  );

  return rows.rows.map(toWork);
}

export async function countApproved(db: Database) {
  const row = await db.first<{ total: number }>(`SELECT COUNT(*) AS total
       FROM revival_works
       WHERE status = 'approved' AND group_primary = 1`);

  return row?.total ?? 0;
}

export async function readAlsoShowing(db: Database, workId: string, kind: RevivalKind, limit = 8) {
  const rows = await db.query<WorkRow>(
    `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.group_primary = 1
         AND w.kind = $1
         AND w.id <> $2
       ORDER BY ${BY_STANDING}
       LIMIT $3`,
    [kind, workId, Math.min(limit, 24)],
  );

  return attachTags(db, rows.rows.map(toWork));
}

export async function countSearch(db: Database, query: string) {
  const like = `%${query.replaceAll(/[%_]/gu, "")}%`;
  const row = await db.first<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM revival_works AS w
       WHERE w.status = 'approved'
         AND w.group_primary = 1
         AND (
           w.title LIKE $1
           OR w.sort_title LIKE $1
           OR w.director LIKE $1
           OR EXISTS (
             SELECT 1 FROM revival_tags AS g
             WHERE g.work_id = w.id AND g.label LIKE $1
           )
         )`,
    [like],
  );

  return row?.total ?? 0;
}

export async function searchApproved(db: Database, query: string, limit = 60, offset = 0) {
  const like = `%${query.replaceAll(/[%_]/gu, "")}%`;
  const rows = await db.query<WorkRow>(
    `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.group_primary = 1
         AND (
           w.title LIKE $1
           OR w.sort_title LIKE $1
           OR w.director LIKE $1
           OR EXISTS (
             SELECT 1 FROM revival_tags AS g
             WHERE g.work_id = w.id AND g.label LIKE $1
           )
         )
       ORDER BY COALESCE(w.popularity, ${UNSCORED_POPULARITY}) DESC, w.sort_title
       LIMIT $2 OFFSET $3`,
    [like, Math.min(Math.max(1, limit), 120), Math.max(0, offset)],
  );

  return attachTags(db, rows.rows.map(toWork));
}

export async function readWork(db: Database, id: string) {
  const row = await db.first<WorkRow>(
    `SELECT ${WORK_COLUMNS} ${WORK_FROM} WHERE w.id = $1 AND w.status = 'approved'`,
    [id],
  );

  if (!row) {
    return null;
  }

  const [work] = await attachTags(db, [toWork(row)]);

  return work ?? null;
}

export type ReelTarget = {
  id: string;
  streamUrl: string;
  streamType: string;
  mirrorKey: string | null;
  mirrorState: RevivalMirrorState;
  gate: ContentGate | null;
};

type GateRow = {
  title: string;
  synopsis: string;
  contentNotice: string | null;
  catalogueCertification: string | null;
};

const GATE_COLUMNS = `w.title, w.synopsis, w.content_notice AS "contentNotice",
   t.certification AS "catalogueCertification"`;

function gateOf(row: GateRow) {
  return revivalGateFor({
    contentNotice: row.contentNotice ?? contentNoticeFor(row.title, row.synopsis),
    certification: row.catalogueCertification,
  });
}

export async function readReelTarget(db: Database, id: string): Promise<ReelTarget | null> {
  const row = await db.first<Omit<ReelTarget, "gate"> & GateRow>(
    `SELECT w.id, w.stream_url AS "streamUrl", w.stream_type AS "streamType",
            w.mirror_key AS "mirrorKey", w.mirror_state AS "mirrorState", ${GATE_COLUMNS}
       ${WORK_FROM}
       WHERE w.id = $1 AND w.status = 'approved' AND w.uk_clear = 1`,
    [id],
  );

  return row
    ? {
        id: row.id,
        streamUrl: row.streamUrl,
        streamType: row.streamType,
        mirrorKey: row.mirrorKey,
        mirrorState: row.mirrorState,
        gate: gateOf(row),
      }
    : null;
}

export async function readStillSource(db: Database, id: string) {
  const row = await db.first<{ stillUrl: string | null } & GateRow>(
    `SELECT w.still_url AS "stillUrl", ${GATE_COLUMNS}
       ${WORK_FROM}
       WHERE w.id = $1 AND w.status = 'approved'`,
    [id],
  );

  return row?.stillUrl ? { stillUrl: row.stillUrl, gate: gateOf(row) } : null;
}

export async function selectArchiveForRecheck(db: Database, limit = 60, staleDays = 30) {
  const rows = await db.query<{ sourceId: string; id: string }>(
    `SELECT source_id AS "sourceId", id
       FROM revival_works
       WHERE source = 'archive'
         AND updated_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))
       ORDER BY updated_at
       LIMIT $2`,
    [`-${Math.max(1, Math.trunc(staleDays))} days`, Math.min(limit, 200)],
  );

  return rows.rows;
}

export async function deleteWork(db: Database, id: string) {
  await db.execute(`DELETE FROM revival_works WHERE id = $1`, [id]);
}

export async function touchWork(db: Database, id: string) {
  await db.execute(`UPDATE revival_works SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
}

export async function recordPlay(db: Database, id: string) {
  await db.execute(`UPDATE revival_works SET plays = plays + 1 WHERE id = $1`, [id]);
}

type ReviewRow = WorkRow & {
  status: string;
  streamUrl: string;
  streamBytes: number | null;
  discoveredAt: string;
  mirrorError: string | null;
};

export async function listForReview(db: Database, status: RevivalStatus, limit = 60) {
  const rows = await db.query<ReviewRow>(
    `SELECT ${WORK_COLUMNS}, w.status, w.stream_bytes AS "streamBytes",
              w.discovered_at AS "discoveredAt", w.mirror_error AS "mirrorError"
       ${WORK_FROM}
       WHERE w.status = $1
       ORDER BY w.discovered_at DESC
       LIMIT $2`,
    [status, Math.min(limit, 200)],
  );

  return rows.rows.map((row) =>
    Object.assign(toWork(row), {
      status: row.status as RevivalStatus,
      mirrorState: row.mirrorState as RevivalMirrorState,
      streamUrl: row.streamUrl,
      streamBytes: row.streamBytes,
      discoveredAt: row.discoveredAt,
      mirrorError: row.mirrorError,
    }),
  );
}

export async function setWorkStatus(
  db: Database,
  id: string,
  status: RevivalStatus,
  reviewer: string,
) {
  const result = await db.execute(
    `UPDATE revival_works
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
    [status, reviewer.slice(0, 120), id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function selectUnmatched(db: Database, limit = 400) {
  const rows = await db.query<{
    id: string;
    title: string;
    year: number | null;
    runtimeSeconds: number | null;
  }>(
    `SELECT id, title, year, runtime_seconds AS "runtimeSeconds"
       FROM revival_works
       WHERE status = 'approved'
         AND title_id IS NULL
         AND kind IN ('feature', 'short')
         AND (matched_at IS NULL OR matched_at < (CURRENT_TIMESTAMP - INTERVAL '30 day'))
       ORDER BY discovered_at DESC
       LIMIT $1`,
    [Math.min(limit, 600)],
  );

  return rows.rows;
}

export async function recordMatch(
  db: Database,
  id: string,
  titleId: string | null,
  confidence: number,
) {
  await db.execute(
    `UPDATE revival_works
       SET title_id = $1, match_confidence = $2, matched_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
    [titleId, confidence, id],
  );
}

export async function selectKnownSourceIds(
  db: Database,
  source: RevivalSource,
  sourceIds: string[],
  freshDays = 30,
) {
  if (sourceIds.length === 0) {
    return new Set<string>();
  }

  const slots = sourceIds.map((_, index) => `$${index + 2}`).join(", ");
  const freshParameter = sourceIds.length + 2;
  const rows = await db.query<{ sourceId: string }>(
    `SELECT source_id AS "sourceId"
       FROM revival_works
       WHERE source = $1
         AND source_id IN (${slots})
         AND updated_at > (CURRENT_TIMESTAMP + CAST($${freshParameter} AS INTERVAL))`,
    [source, ...sourceIds, `-${Math.max(1, Math.trunc(freshDays))} days`],
  );

  return new Set(rows.rows.map((row) => row.sourceId));
}

export async function refreshPopularity(
  db: Database,
  source: RevivalSource,
  entries: {
    sourceId: string;
    popularity: number | null;
    downloads: number | null;
  }[],
) {
  const scored = entries.filter((entry) => entry.popularity !== null);

  if (scored.length === 0) {
    return 0;
  }

  await db.transaction(async (transaction) => {
    for (const entry of scored) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `UPDATE revival_works SET popularity = $1, downloads = COALESCE($2, downloads)
           WHERE source = $3 AND source_id = $4`,
        [entry.popularity, entry.downloads, source, entry.sourceId],
      );
    }
  });

  return scored.length;
}

export async function selectUnmirrored(db: Database, limit = 5) {
  const rows = await db.query<{ id: string }>(
    `SELECT id
       FROM revival_works
       WHERE status = 'approved'
         AND uk_clear = 1
         AND mirror_state IN ('remote', 'copying')
       ORDER BY mirror_state = 'copying' DESC, plays DESC, discovered_at
       LIMIT $1`,
    [Math.min(limit, 50)],
  );

  return rows.rows.map((row) => row.id);
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

export async function readMirrorRow(db: Database, id: string) {
  const row = await db.first<MirrorRow>(
    `SELECT id, stream_url AS "streamUrl", stream_type AS "streamType",
              mirror_key AS "mirrorKey", mirror_state AS "mirrorState",
              mirror_upload_id AS "mirrorUploadId", mirror_parts AS "mirrorParts",
              mirror_offset AS "mirrorOffset"
       FROM revival_works
       WHERE id = $1 AND status = 'approved'`,
    [id],
  );

  return row ?? null;
}

export async function saveMirrorProgress(
  db: Database,
  id: string,
  patch: { key: string; uploadId: string; parts: string; offset: number },
) {
  await db.execute(
    `UPDATE revival_works
       SET mirror_state = 'copying', mirror_key = $1, mirror_upload_id = $2,
           mirror_parts = $3, mirror_offset = $4, mirror_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
    [patch.key, patch.uploadId, patch.parts, patch.offset, id],
  );
}

export async function completeMirror(db: Database, id: string, key: string, bytes: number) {
  await db.execute(
    `UPDATE revival_works
       SET mirror_state = 'mirrored', mirror_key = $1, mirror_upload_id = NULL,
           mirror_parts = '[]', mirror_offset = $2, mirror_error = NULL,
           mirrored_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
    [key, bytes, id],
  );
}

export async function failMirror(db: Database, id: string, reason: string) {
  await db.execute(
    `UPDATE revival_works
       SET mirror_state = 'failed', mirror_upload_id = NULL, mirror_parts = '[]',
           mirror_offset = 0, mirror_error = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
    [reason.slice(0, 300), id],
  );
}

export async function resetMirror(db: Database, id: string) {
  await db.execute(
    `UPDATE revival_works
       SET mirror_state = 'remote', mirror_key = NULL, mirror_upload_id = NULL,
           mirror_parts = '[]', mirror_offset = 0, mirror_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
    [id],
  );
}

export async function readProgress(db: Database, viewerId: string, workId: string) {
  const row = await db.first<{ positionSeconds: number; finished: number }>(
    `SELECT position_seconds AS "positionSeconds", finished
       FROM revival_progress
       WHERE viewer_id = $1 AND work_id = $2`,
    [viewerId, workId],
  );

  return {
    positionSeconds: row?.positionSeconds ?? 0,
    finished: Boolean(row?.finished),
  };
}

export async function saveProgress(
  db: Database,
  viewerId: string,
  workId: string,
  positionSeconds: number,
  finished: boolean,
) {
  await db.execute(
    `INSERT INTO revival_progress (viewer_id, work_id, position_seconds, finished)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(viewer_id, work_id) DO UPDATE SET
         position_seconds = excluded.position_seconds,
         finished = GREATEST(revival_progress.finished, excluded.finished),
         updated_at = CURRENT_TIMESTAMP`,
    [viewerId, workId, Math.max(0, Math.floor(positionSeconds)), finished ? 1 : 0],
  );
}

export async function readWorksByIds(db: Database, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const wanted = ids.slice(0, 50);
  const rows = await db.query<WorkRow>(
    `SELECT ${WORK_COLUMNS}
       ${WORK_FROM}
       WHERE w.status = 'approved'
         AND w.id IN (${wanted.map((_, index) => `$${index + 1}`).join(", ")})`,
    [...wanted],
  );
  const byId = new Map(rows.rows.map((row) => [row.id, toWork(row)]));

  return wanted.flatMap((id) => {
    const work = byId.get(id);

    return work ? [work] : [];
  });
}

export async function readViewerProgress(db: Database, viewerId: string, limit = 12) {
  const rows = await db.query<{ id: string; positionSeconds: number; finished: number }>(
    `SELECT w.id, p.position_seconds AS "positionSeconds", p.finished
       FROM revival_progress AS p
       JOIN revival_works AS w ON w.id = p.work_id
       WHERE p.viewer_id = $1 AND p.finished = 0 AND p.position_seconds > 30
         AND w.status = 'approved'
       ORDER BY p.updated_at DESC
       LIMIT $2`,
    [viewerId, Math.min(limit, 50)],
  );

  return rows.rows;
}

export async function recordSourceRun(
  db: Database,
  source: RevivalSource,
  cursor: string,
  counts: { seen: number; accepted: number; rejected: number },
) {
  await db.execute(
    `INSERT INTO revival_source_runs (source, cursor, seen, accepted, rejected, ran_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT(source) DO UPDATE SET
         cursor = excluded.cursor,
         seen = revival_source_runs.seen + excluded.seen,
         accepted = revival_source_runs.accepted + excluded.accepted,
         rejected = revival_source_runs.rejected + excluded.rejected,
         ran_at = CURRENT_TIMESTAMP`,
    [source, cursor, counts.seen, counts.accepted, counts.rejected],
  );
}

export async function readSourceCursor(db: Database, source: RevivalSource) {
  const row = await db.first<{ cursor: string }>(
    `SELECT cursor FROM revival_source_runs WHERE source = $1`,
    [source],
  );

  return row?.cursor ?? "";
}

export async function readRevivalStats(db: Database) {
  const row = await db.first<Record<string, number>>(`SELECT
         (SELECT count(*) FROM revival_works) AS works,
         (SELECT count(*) FROM revival_works WHERE status = 'approved') AS approved,
         (SELECT count(*) FROM revival_works WHERE status = 'candidate') AS candidates,
         (SELECT count(*) FROM revival_works WHERE status = 'rejected') AS rejected,
         (SELECT count(*) FROM revival_works WHERE mirror_state = 'mirrored') AS mirrored,
         (SELECT count(*) FROM revival_works WHERE mirror_state = 'copying') AS copying,
         (SELECT count(*) FROM revival_works WHERE mirror_state = 'failed') AS "mirrorFailed",
         (SELECT count(*) FROM revival_works WHERE title_id IS NOT NULL) AS matched,
         (SELECT count(*) FROM revival_works WHERE uk_clear = 1) AS "ukClear",
         (SELECT count(*) FROM revival_works WHERE uk_clear = 0 AND rights_checked_at IS NOT NULL) AS "ukUnknown",
         (SELECT coalesce(sum(mirror_offset), 0) FROM revival_works WHERE mirror_state = 'mirrored') AS "mirroredBytes"`);

  return row ?? {};
}
