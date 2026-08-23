import type { EntryStatus } from "../types";
import type { MediaType } from "./catalog";

export type BeliefScope = "always" | "tonight" | "week";

export type Belief = {
  id: string;
  key: string;
  value: string;
  strength: number;
  confidence: number;
  scope: BeliefScope;
  sourceRule: string;
  edited: boolean;
  suspendedUntil: string | null;
  evidence: number;
};

export type Notebook = {
  beliefs: Belief[];
  updatedAt: string;
};

export const BELIEF_SCOPES: BeliefScope[] = ["always", "tonight", "week"];

export function isBeliefScope(value: unknown): value is BeliefScope {
  return typeof value === "string" && BELIEF_SCOPES.includes(value as BeliefScope);
}

export function confidenceLabel(confidence: number) {
  if (confidence >= 0.85) {
    return "I know this";
  }

  if (confidence >= 0.6) {
    return "Fairly sure";
  }

  if (confidence >= 0.35) {
    return "It looks that way";
  }

  return "I may be imagining this";
}

export function strengthLabel(strength: number) {
  if (strength >= 0.75) {
    return "strongly";
  }

  if (strength >= 0.45) {
    return "clearly";
  }

  return "mildly";
}

export function beliefGroup(key: string) {
  return key.split(":")[0] ?? "other";
}

export const GROUP_TITLES: Record<string, string> = {
  genre: "What you reach for",
  avoid: "What you leave alone",
  person: "Faces you follow",
  runtime: "How long you sit still",
  mood: "Lately",
  hunch: "Hunches, which I may be wrong about",
  service: "Where you actually watch",
  habit: "How you watch",
};

export function isSuspended(belief: Belief, now = Date.now()) {
  return Boolean(belief.suspendedUntil && Date.parse(belief.suspendedUntil) > now);
}

export type Guest = {
  id: string;
  name: string;
  vetoes: string[];
  leanings: string[];
};

export type MapNeighbour = {
  titleId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  tmdbId: number;
};

export type MapMark = {
  status: EntryStatus;
  rating: number | null;
  note: string;
  markedAt: string;
};

export type MapScore = { label: string; display: string };

export type MapPoint = {
  titleId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  tmdbId: number;
  genre: string;
  genres: string[];
  weight: number;
  x: number;
  y: number;
  posterUrl: string | null;
  overview: string;
  runtimeMinutes: number | null;
  numberOfSeasons: number | null;
  certification: string | null;
  scores: MapScore[];
  mark: MapMark | null;
  neighbours: MapNeighbour[];
};

export type MapAxis = { low: string; high: string } | null;

export type TasteMapResponse = {
  status: "ready" | "sparse" | "pending";
  points: MapPoint[];
  shelfCount: number;
  mappedCount: number;
  axes: { x: MapAxis; y: MapAxis };
};

const MARK_STATUS: Record<EntryStatus, string> = {
  watchlist: "On your watchlist",
  watching: "Watching",
  watched: "Watched",
  dropped: "Set down part way",
};

const LEAN_HIGH = 0.62;
const LEAN_LOW = 0.38;

export function markStatusLabel(status: EntryStatus) {
  return MARK_STATUS[status];
}

export function verdictLabel(weight: number) {
  if (weight >= 1.1) {
    return "Landed hard";
  }

  if (weight >= 0) {
    return "Landed";
  }

  return weight <= -0.8 ? "Did not land at all" : "Did not land";
}

export function pointMeta(point: MapPoint) {
  const length =
    point.mediaType === "movie"
      ? point.runtimeMinutes
        ? `${point.runtimeMinutes} min`
        : null
      : point.numberOfSeasons
        ? `${point.numberOfSeasons} season${point.numberOfSeasons === 1 ? "" : "s"}`
        : null;

  return [point.year?.toString(), length, point.certification].filter(Boolean).join(" · ");
}

function axisEnd(value: number, axis: MapAxis) {
  if (!axis) {
    return null;
  }

  if (value >= LEAN_HIGH) {
    return axis.high;
  }

  return value <= LEAN_LOW ? axis.low : null;
}

export function leaning(point: MapPoint, axes: TasteMapResponse["axes"]) {
  if (!axes.x && !axes.y) {
    return "";
  }

  const ends = [axisEnd(point.x, axes.x), axisEnd(point.y, axes.y)].filter(
    (end): end is string => end !== null,
  );

  return ends.length > 0
    ? `Sits toward ${ends.join(" and ")}`
    : "Sits in the middle of both directions";
}
