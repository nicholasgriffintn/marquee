import type { EntryStatus } from "../../types.ts";

const STATUS_WEIGHT: Record<EntryStatus, number> = {
  watched: 1,
  watching: 0.8,
  watchlist: 0.5,
  dropped: -0.6,
};

const RATING_LADDER: [number, number][] = [
  [5, 1.6],
  [4, 1.3],
  [3, 0.7],
  [2, -0.5],
];

const POOR_RATING = -1.1;
const UNRATED = 1;
const HALF_LIFE_DAYS = 240;
const RECENCY_FLOOR = 0.15;

function statusWeight(status: EntryStatus) {
  return STATUS_WEIGHT[status] ?? 0;
}

function ratingWeight(rating: number | null) {
  if (rating === null) {
    return UNRATED;
  }

  return RATING_LADDER.find(([minimum]) => rating >= minimum)?.[1] ?? POOR_RATING;
}

export function entryWeight(status: EntryStatus, rating: number | null) {
  return statusWeight(status) * ratingWeight(rating);
}

export function recencyWeight(updatedAt: string, now = Date.now()) {
  const stamped = Date.parse(updatedAt);

  if (Number.isNaN(stamped)) {
    return RECENCY_FLOOR;
  }

  const ageDays = Math.max(0, (now - stamped) / 86_400_000);

  return Math.max(RECENCY_FLOOR, 0.5 ** (ageDays / HALF_LIFE_DAYS));
}

function statusCase(column: string) {
  const branches = Object.entries(STATUS_WEIGHT).map(
    ([status, weight]) => `WHEN ${column} = '${status}' THEN ${weight}`,
  );

  return `CASE ${branches.join(" ")} ELSE 0 END`;
}

function ratingCase(column: string) {
  const branches = RATING_LADDER.map(
    ([minimum, weight]) => `WHEN ${column} >= ${minimum} THEN ${weight}`,
  );

  return `CASE WHEN ${column} IS NULL THEN ${UNRATED} ${branches.join(" ")} ELSE ${POOR_RATING} END`;
}

export function entryWeightSql(statusColumn: string, ratingColumn: string) {
  return `(${statusCase(statusColumn)}) * (${ratingCase(ratingColumn)})`;
}
