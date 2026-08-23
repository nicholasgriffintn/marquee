import type { MediaType } from "../../src/domain/catalog.ts";
import { measureDiscoverWindow, TMDB_MAX_PAGES, TMDB_PAGE_SIZE } from "../clients/tmdb.ts";
import { logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import {
  addDays,
  advancePartitionCursor,
  claimPendingPartitions,
  countPartitions,
  daysBetween,
  insertPartitions,
  markPartitionMeasured,
  markPartitionSplit,
  readDrainablePartitions,
  readPartition,
  reopenStalePartitions,
  requeueStuckMeasurements,
} from "../repositories/discover.ts";
import type { Bindings, IngestionJob } from "../types.ts";

const MEDIA_TYPES: MediaType[] = ["movie", "tv"];
const EPOCH_YEAR: Record<MediaType, number> = { movie: 1874, tv: 1928 };
const HORIZON_YEARS = 3;
const SEED_SPAN_YEARS = 10;

const MEASURE_PER_SWEEP = 80;
const REOPEN_PER_SWEEP = 12;
const DRAIN_PARTITIONS_PER_SWEEP = 12;
const PAGES_PER_PARTITION_PER_SWEEP = 60;
const PAGES_PER_SWEEP = 400;

function horizonYear() {
  const target = new Date().getUTCFullYear() + HORIZON_YEARS;

  return Math.floor(target / SEED_SPAN_YEARS) * SEED_SPAN_YEARS + SEED_SPAN_YEARS - 1;
}

function seedWindows(mediaType: MediaType) {
  const epoch = EPOCH_YEAR[mediaType];
  const horizon = horizonYear();
  const windows: { mediaType: MediaType; startDate: string; endDate: string; depth: number }[] = [];

  for (
    let year = Math.floor(epoch / SEED_SPAN_YEARS) * SEED_SPAN_YEARS;
    year <= horizon;
    year += SEED_SPAN_YEARS
  ) {
    const startYear = Math.max(year, epoch);
    const endYear = Math.min(year + SEED_SPAN_YEARS - 1, horizon);

    if (startYear <= endYear) {
      windows.push({
        mediaType,
        startDate: `${startYear}-01-01`,
        endDate: `${endYear}-12-31`,
        depth: 0,
      });
    }
  }

  return windows;
}

async function seedPartitions(env: Bindings) {
  const existing = await countPartitions(env.DB);
  const windows = MEDIA_TYPES.flatMap((mediaType) =>
    existing > 0 ? seedWindows(mediaType).slice(-1) : seedWindows(mediaType),
  );

  await insertPartitions(env.DB, windows);

  return existing > 0 ? 0 : windows.length;
}

export async function measureDiscoverPartition(env: Bindings, id: string) {
  const partition = await readPartition(env.DB, id);

  if (!partition || partition.status === "split") {
    return;
  }

  const { totalResults, totalPages } = await measureDiscoverWindow(env, partition.mediaType, {
    startDate: partition.startDate,
    endDate: partition.endDate,
  });
  const span = daysBetween(partition.startDate, partition.endDate);

  if (totalPages > TMDB_MAX_PAGES && span >= 1) {
    const midpoint = addDays(partition.startDate, Math.floor(span / 2));

    await markPartitionSplit(env.DB, id, totalResults);
    await insertPartitions(env.DB, [
      {
        mediaType: partition.mediaType,
        startDate: partition.startDate,
        endDate: midpoint,
        depth: partition.depth + 1,
      },
      {
        mediaType: partition.mediaType,
        startDate: addDays(midpoint, 1),
        endDate: partition.endDate,
        depth: partition.depth + 1,
      },
    ]);

    logEvent("discover_partition_split", { partition: id, totalResults });

    return;
  }

  const reachable = Math.min(totalPages, TMDB_MAX_PAGES);

  await markPartitionMeasured(env.DB, id, totalResults, reachable);

  logEvent("discover_partition_measured", {
    partition: id,
    totalResults,
    totalPages,
    reachable,
    truncated: totalPages > TMDB_MAX_PAGES,
  });
}

export async function advanceDiscoverFrontier(env: Bindings) {
  const seeded = await seedPartitions(env);
  const requeued = await requeueStuckMeasurements(env.DB);
  const reopened = await reopenStalePartitions(env.DB, REOPEN_PER_SWEEP);
  const pending = await claimPendingPartitions(env.DB, MEASURE_PER_SWEEP);
  const jobs: IngestionJob[] = pending.map((partition) => ({
    type: "measure-discover-partition",
    partitionId: partition.id,
  }));
  const drainable = await readDrainablePartitions(env.DB, DRAIN_PARTITIONS_PER_SWEEP);
  const cursors: { id: string; nextPage: number }[] = [];
  let remaining = PAGES_PER_SWEEP;

  for (const partition of drainable) {
    if (remaining <= 0) {
      break;
    }

    const lastPage = Math.min(partition.totalPages, TMDB_MAX_PAGES);
    const take = Math.min(
      PAGES_PER_PARTITION_PER_SWEEP,
      remaining,
      lastPage - partition.nextPage + 1,
    );

    if (take <= 0) {
      continue;
    }

    for (let offset = 0; offset < take; offset += 1) {
      jobs.push({
        type: "sync-discover-page",
        mediaType: partition.mediaType,
        page: partition.nextPage + offset,
        partitionId: partition.id,
      });
    }

    remaining -= take;
    cursors.push({ id: partition.id, nextPage: partition.nextPage + take });
  }

  await enqueue(env.INGESTION_QUEUE, jobs);

  for (const cursor of cursors) {
    // oxlint-disable-next-line no-await-in-loop
    await advancePartitionCursor(env.DB, cursor.id, cursor.nextPage);
  }

  const pages = PAGES_PER_SWEEP - remaining;

  logEvent("discover_frontier_advanced", {
    seeded,
    requeued,
    reopened,
    measuring: pending.length,
    pages,
    titles: pages * TMDB_PAGE_SIZE,
  });

  return { seeded, requeued, reopened, measuring: pending.length, pages };
}
