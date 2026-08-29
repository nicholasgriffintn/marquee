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

const COLUMNS = `id, media_type AS "mediaType", start_date AS "startDate", end_date AS "endDate",
   status, depth, total_results AS "totalResults", total_pages AS "totalPages",
   next_page AS "nextPage", pages_done AS "pagesDone",
   measured_at AS "measuredAt", completed_at AS "completedAt"`;

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

export async function countPartitions(db: Database) {
  const row = await db.first<{ partitions: number }>(
    `SELECT count(*) AS partitions FROM discover_partitions`,
  );

  return row?.partitions ?? 0;
}

export async function readPartition(db: Database, id: string) {
  return db.first<DiscoverPartition>(`SELECT ${COLUMNS} FROM discover_partitions WHERE id = $1`, [
    id,
  ]);
}

export async function insertPartitions(
  db: Database,
  partitions: { mediaType: MediaType; startDate: string; endDate: string; depth: number }[],
) {
  if (partitions.length === 0) {
    return;
  }

  await db.transaction(async (transaction) => {
    for (const partition of partitions) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO discover_partitions (id, media_type, start_date, end_date, depth)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT(id) DO NOTHING`,
        [
          partitionId(partition.mediaType, partition.startDate, partition.endDate),
          partition.mediaType,
          partition.startDate,
          partition.endDate,
          partition.depth,
        ],
      );
    }
  });
}

export async function claimPendingPartitions(db: Database, limit: number) {
  const rows = await db.query<DiscoverPartition>(
    `UPDATE discover_partitions
       SET status = 'measuring', updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM discover_partitions
         WHERE status = 'pending'
         ORDER BY end_date DESC
         LIMIT $1
       )
       RETURNING ${COLUMNS}`,
    [limit],
  );

  return rows.rows;
}

export async function requeueStuckMeasurements(db: Database) {
  const result = await db.execute(`UPDATE discover_partitions
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'measuring' AND updated_at < (CURRENT_TIMESTAMP - INTERVAL '2 hour')`);

  return result.rowCount;
}

export async function readDrainablePartitions(db: Database, limit: number) {
  const rows = await db.query<DiscoverPartition>(
    `SELECT ${COLUMNS}
       FROM discover_partitions
       WHERE status = 'active' AND next_page <= total_pages
       ORDER BY end_date DESC
       LIMIT $1`,
    [limit],
  );

  return rows.rows;
}

export async function markPartitionMeasured(
  db: Database,
  id: string,
  totalResults: number,
  totalPages: number,
) {
  await db.execute(
    `UPDATE discover_partitions
       SET status = CASE WHEN $1 > 0 THEN 'active' ELSE 'done' END,
           total_results = $2,
           total_pages = $3,
           next_page = 1,
           pages_done = 0,
           measured_at = CURRENT_TIMESTAMP,
           completed_at = CASE WHEN $4 > 0 THEN NULL ELSE CURRENT_TIMESTAMP END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
    [totalPages, totalResults, totalPages, totalPages, id],
  );
}

export async function markPartitionSplit(db: Database, id: string, totalResults: number) {
  await db.execute(
    `UPDATE discover_partitions
       SET status = 'split',
           total_results = $1,
           measured_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
    [totalResults, id],
  );
}

export async function advancePartitionCursors(
  db: Database,
  cursors: { id: string; nextPage: number }[],
) {
  if (cursors.length === 0) {
    return;
  }

  await db.transaction(async (transaction) => {
    for (const cursor of cursors) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `UPDATE discover_partitions
           SET next_page = $1,
               status = CASE WHEN $2 > total_pages THEN 'done' ELSE status END,
               completed_at = CASE WHEN $3 > total_pages THEN CURRENT_TIMESTAMP ELSE completed_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
        [cursor.nextPage, cursor.nextPage, cursor.nextPage, cursor.id],
      );
    }
  });
}

export async function recordPageDrained(db: Database, id: string) {
  await db.execute(
    `UPDATE discover_partitions
       SET pages_done = pages_done + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
    [id],
  );
}

export async function reopenStalePartitions(db: Database, limit: number) {
  const result = await db.execute(
    `UPDATE discover_partitions
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM discover_partitions
         WHERE status = 'done'
           AND completed_at < CURRENT_TIMESTAMP
             - CASE
               WHEN pages_done < total_pages THEN 1
               WHEN end_date >= (CURRENT_DATE - INTERVAL '1 year') THEN 3
               WHEN end_date >= (CURRENT_DATE - INTERVAL '5 year') THEN 30
               ELSE 180
             END * INTERVAL '1 day'
         ORDER BY end_date DESC
         LIMIT $1
       )`,
    [limit],
  );

  return result.rowCount;
}

export async function readBackfillProgress(db: Database) {
  const rows = await db.query<{
    mediaType: string;
    status: string;
    partitions: number;
    titles: number;
    pagesDone: number;
    totalPages: number;
  }>(`SELECT media_type AS "mediaType", status,
              count(*) AS partitions,
              sum(total_results) AS titles,
              sum(pages_done) AS "pagesDone",
              sum(total_pages) AS "totalPages"
       FROM discover_partitions
       GROUP BY media_type, status
       ORDER BY media_type, status`);

  return rows.rows;
}
