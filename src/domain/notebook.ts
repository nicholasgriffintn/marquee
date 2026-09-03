import type { EntryStatus } from "../types";
import type { MediaType } from "./catalog";

export type BeliefScope = "always" | "tonight" | "week";

export type BeliefPolarity = "seeks" | "avoids";

export type Belief = {
  id: string;
  key: string;
  value: string;
  strength: number;
  confidence: number;
  scope: BeliefScope;
  sourceRule: string;
  trait: string | null;
  polarity: BeliefPolarity | null;
  edited: boolean;
  suspendedUntil: string | null;
  evidence: number;
};

export type BeliefEvidenceNote = {
  id: string;
  title: string;
  excerpt: string;
  notedAt: string;
};

export type Notebook = {
  beliefs: Belief[];
  updatedAt: string;
};

export const BELIEF_SCOPES: BeliefScope[] = ["always", "tonight", "week"];

export function isBeliefScope(value: unknown): value is BeliefScope {
  return typeof value === "string" && BELIEF_SCOPES.includes(value as BeliefScope);
}

export const BELIEF_POLARITIES: BeliefPolarity[] = ["seeks", "avoids"];

export function isBeliefPolarity(value: unknown): value is BeliefPolarity {
  return typeof value === "string" && BELIEF_POLARITIES.includes(value as BeliefPolarity);
}

export const NOTE_FACET_RULE = "ai:note-facet";

const HUNCH_PREFIX = "hunch:";

const FACET_EVIDENCE_FLOOR = 2;
const FACET_TRAIT_LENGTH = 40;
const FACET_TRAIT_WORDS = 5;
const CONFIDENCE_FLOOR = 0.25;
const CONFIDENCE_STEP = 0.12;
const CONFIDENCE_CEILING = 0.8;

export function evidenceConfidence(count: number) {
  return Math.min(CONFIDENCE_CEILING, CONFIDENCE_FLOOR + count * CONFIDENCE_STEP);
}

export function facetTrait(value: string) {
  const cleaned = value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9 -]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, FACET_TRAIT_LENGTH)
    .trim();

  return cleaned.split(" ").length > FACET_TRAIT_WORDS || cleaned.length < 3 ? "" : cleaned;
}

export function facetSentence(trait: string, polarity: BeliefPolarity) {
  return polarity === "seeks"
    ? `In your own notes, ${trait} keeps winning you over.`
    : `In your own notes, ${trait} keeps putting you off.`;
}

export function requiredEvidence(belief: Pick<Belief, "key" | "sourceRule">) {
  return belief.sourceRule === NOTE_FACET_RULE || belief.key.startsWith(HUNCH_PREFIX)
    ? FACET_EVIDENCE_FLOOR
    : 0;
}

export function missingEvidence(belief: Pick<Belief, "key" | "sourceRule" | "evidence">) {
  return Math.max(0, requiredEvidence(belief) - belief.evidence);
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

export function beliefSteersPicks(belief: Belief, now = Date.now()) {
  return !isSuspended(belief, now) && missingEvidence(belief) === 0;
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

export type NotebookDivider = { id: string; label: string; aside: string };

export const NOTEBOOK_DIVIDERS: NotebookDivider[] = [
  {
    id: "preferences",
    label: "Your preferences",
    aside: "language, your age, location and your cinema",
  },
  {
    id: "notes",
    label: "What I have written down",
    aside: "and what you have crossed out",
  },
  { id: "shape", label: "The shape of it", aside: "your shelf, laid out flat" },
  {
    id: "services",
    label: "Where you watch",
    aside: "and what you are paying for",
  },
  {
    id: "room",
    label: "Who sits with you",
    aside: "and what they will not sit through",
  },
  {
    id: "post",
    label: "When I should write",
    aside: "sparingly, and never twice",
  },
  {
    id: "elsewhere",
    label: "Elsewhere you have an account",
    aside: "keys to other houses",
  },
];

export function notebookDividerId(hash: string) {
  const id = hash.replace(/^#/u, "");

  return NOTEBOOK_DIVIDERS.some((divider) => divider.id === id) ? id : NOTEBOOK_DIVIDERS[0].id;
}
