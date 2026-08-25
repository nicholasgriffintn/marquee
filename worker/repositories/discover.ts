import type { MediaType } from "../../src/domain/catalog.ts";

export type PartitionStatus = "pending" | "measuring" | "active" | "split" | "done";

export type DiscoverPartition = {
  id: string;
  mediaType: MediaType;
  startDate: string;
  endDate: string;
  status: PartitionStatus;
  depth: number;
  totalResults: number;
  totalPages: number;
  nextPage: number;
  pagesDone: number;
  measuredAt: string | null;
  completedAt: string | null;
};

const COLUMNS = `id, media_type AS mediaType, start_date AS startDate, end_date AS endDate,
   status, depth, total_results AS totalResults, total_pages AS totalPages,
   next_page AS nextPage, pages_done AS pagesDone,
   measured_at AS measuredAt, completed_at AS completedAt`;

export function partitionId(mediaType: MediaType, startDate: string, endDate: string) {
  return `${mediaType}:${startDate}:${endDate}`;
}

export function isPartitionId(value: unknown): value is string {
  return (
    typeof value === "string" && /^(movie|tv):\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/u.test(value)
  );
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(startDate: string, endDate: string) {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
}

export async function countPartitions(db: D1Database) {
  const row = await db
    .prepare(`SELECT count(*) AS partitions FROM discover_partitions`)
    .first<{ partitions: number }>();

  return row?.partitions ?? 0;
}

export async function readPartition(db: D1Database, id: string) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM discover_partitions WHERE id = ?`)
    .bind(id)
    .first<DiscoverPartition>();
}

export async function insertPartitions(
  db: D1Database,
  partitions: { mediaType: MediaType; startDate: string; endDate: string; depth: number }[],
) {
  if (partitions.length === 0) {
    return;
  }

  await db.batch(
    partitions.map((partition) =>
      db
        .prepare(
          `INSERT INTO discover_partitions (id, media_type, start_date, end_date, depth)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          partitionId(partition.mediaType, partition.startDate, partition.endDate),
          partition.mediaType,
          partition.startDate,
          partition.endDate,
          partition.depth,
        ),
    ),
  );
}

export async function claimPendingPartitions(db: D1Database, limit: number) {
  const rows = await db
    .prepare(
      `UPDATE discover_partitions
       SET status = 'measuring', updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM discover_partitions
         WHERE status = 'pending'
         ORDER BY end_date DESC
         LIMIT ?
       )
       RETURNING ${COLUMNS}`,
    )
    .bind(limit)
    .all<DiscoverPartition>();

  return rows.results;
}

export async function requeueStuckMeasurements(db: D1Database) {
  const result = await db
    .prepare(
      `UPDATE discover_partitions
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'measuring' AND updated_at < datetime('now', '-2 hours')`,
    )
    .run();

  return result.meta.changes;
}

export async function readDrainablePartitions(db: D1Database, limit: number) {
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS}
       FROM discover_partitions
       WHERE status = 'active' AND next_page <= total_pages
       ORDER BY end_date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DiscoverPartition>();

  return rows.results;
}

export async function markPartitionMeasured(
  db: D1Database,
  id: string,
  totalResults: number,
  totalPages: number,
) {
  await db
    .prepare(
      `UPDATE discover_partitions
       SET status = CASE WHEN ? > 0 THEN 'active' ELSE 'done' END,
           total_results = ?,
           total_pages = ?,
           next_page = 1,
           pages_done = 0,
           measured_at = CURRENT_TIMESTAMP,
           completed_at = CASE WHEN ? > 0 THEN NULL ELSE CURRENT_TIMESTAMP END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(totalPages, totalResults, totalPages, totalPages, id)
    .run();
}

export async function markPartitionSplit(db: D1Database, id: string, totalResults: number) {
  await db
    .prepare(
      `UPDATE discover_partitions
       SET status = 'split',
           total_results = ?,
           measured_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(totalResults, id)
    .run();
}

export async function advancePartitionCursors(
  db: D1Database,
  cursors: { id: string; nextPage: number }[],
) {
  if (cursors.length === 0) {
    return;
  }

  await db.batch(
    cursors.map((cursor) =>
      db
        .prepare(
          `UPDATE discover_partitions
           SET next_page = ?,
               status = CASE WHEN ? > total_pages THEN 'done' ELSE status END,
               completed_at = CASE WHEN ? > total_pages THEN CURRENT_TIMESTAMP ELSE completed_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(cursor.nextPage, cursor.nextPage, cursor.nextPage, cursor.id),
    ),
  );
}

export async function recordPageDrained(db: D1Database, id: string) {
  await db
    .prepare(
      `UPDATE discover_partitions
       SET pages_done = pages_done + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(id)
    .run();
}

export async function reopenStalePartitions(db: D1Database, limit: number) {
  const result = await db
    .prepare(
      `UPDATE discover_partitions
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM discover_partitions
         WHERE status = 'done'
           AND completed_at < datetime(
             'now',
             '-' || CASE
               WHEN pages_done < total_pages THEN 1
               WHEN end_date >= date('now', '-1 year') THEN 3
               WHEN end_date >= date('now', '-5 years') THEN 30
               ELSE 180
             END || ' days'
           )
         ORDER BY end_date DESC
         LIMIT ?
       )`,
    )
    .bind(limit)
    .run();

  return result.meta.changes;
}

export async function readBackfillProgress(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT media_type AS mediaType, status,
              count(*) AS partitions,
              sum(total_results) AS titles,
              sum(pages_done) AS pagesDone,
              sum(total_pages) AS totalPages
       FROM discover_partitions
       GROUP BY media_type, status
       ORDER BY media_type, status`,
    )
    .all<{
      mediaType: string;
      status: string;
      partitions: number;
      titles: number;
      pagesDone: number;
      totalPages: number;
    }>();

  return rows.results;
}
