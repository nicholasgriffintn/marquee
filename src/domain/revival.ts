export type RevivalSource = "archive" | "loc" | "europeana";

export type RevivalKind = "feature" | "short" | "episode" | "ephemeral";

export type RevivalRightsBasis =
  | "uk-expired"
  | "eu-institution"
  | "cc0"
  | "us-gov"
  | "pd-mark"
  | "us-expired"
  | "curated"
  | "unclear";

export function assertsPublicDomain(basis: RevivalRightsBasis) {
  return basis !== "unclear";
}

export type RevivalStatus = "candidate" | "approved" | "rejected";

export type RevivalMirrorState = "remote" | "copying" | "mirrored" | "failed";

export type RevivalTagKind = "subject" | "genre" | "person" | "language" | "holder";

export type RevivalTag = { kind: RevivalTagKind; slug: string; label: string };

export type RevivalWork = {
  id: string;
  source: RevivalSource;
  sourceUrl: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  kind: RevivalKind;
  runtimeSeconds: number | null;
  stillUrl: string | null;
  rightsBasis: RevivalRightsBasis;
  rightsNote: string;
  rightsUrl: string | null;
  titleId: string | null;
  country: string | null;
  ukClear: boolean;
  ukExpiresYear: number | null;
  mirrored: boolean;
  delivery: "mirror" | "source";
  reelUrl: string;
  plays: number;
  condition: PrintCondition;
  tags: RevivalTag[];
};

export type RevivalShelf = {
  id: string;
  title: string;
  description: string;
  works: RevivalWork[];
};

export type RevivalProgramme = {
  shelves: RevivalShelf[];
  total: number;
  fetchedAt: string;
};

export type RevivalScreening = {
  work: RevivalWork;
  positionSeconds: number;
  finished: boolean;
  alsoShowing: RevivalWork[];
};

export const RIGHTS_LABELS: Record<RevivalRightsBasis, string> = {
  "uk-expired": "UK copyright expired",
  "eu-institution": "Released by a European archive",
  cc0: "CC0 dedication",
  "us-gov": "US Government work",
  "pd-mark": "Public Domain Mark",
  "us-expired": "US copyright expired",
  curated: "Cleared by hand",
  unclear: "Not established",
};

export const SOURCE_LABELS: Record<RevivalSource, string> = {
  archive: "Internet Archive",
  loc: "Library of Congress",
  europeana: "Europeana",
};

export type PrintCondition = "pristine" | "watchable" | "rough" | "unknown";

const ROUGH_BITRATE = 500_000;
const GOOD_BITRATE = 1_500_000;

export function printCondition(
  streamBytes: number | null,
  runtimeSeconds: number | null,
  height: number | null,
): PrintCondition {
  if (height && height >= 700) {
    return "pristine";
  }

  if (!streamBytes || !runtimeSeconds || runtimeSeconds < 30) {
    return "unknown";
  }

  const bitrate = (streamBytes * 8) / runtimeSeconds;

  if (bitrate >= GOOD_BITRATE) {
    return "pristine";
  }

  return bitrate >= ROUGH_BITRATE ? "watchable" : "rough";
}

export const CONDITION_NOTES: Record<PrintCondition, string> = {
  pristine: "A clean print. Somebody looked after this one.",
  watchable: "The print has seen a few decades. It holds up.",
  rough: "Rough print. Grain, wobble, and a soundtrack doing its best.",
  unknown: "I have not had a proper look at this print yet.",
};

export const CONDITION_LABELS: Record<PrintCondition, string> = {
  pristine: "Clean print",
  watchable: "Worn print",
  rough: "Rough print",
  unknown: "Unseen print",
};

export function reelPath(workId: string) {
  return `/media/reel/${workId}`;
}

export function deliveryNote(work: RevivalWork) {
  if (work.delivery === "source") {
    return `Played from ${SOURCE_LABELS[work.source]}, who hold it`;
  }

  return work.mirrored
    ? `Marquee, copied from ${SOURCE_LABELS[work.source]}`
    : `${SOURCE_LABELS[work.source]}, streamed through us`;
}

export function revivalPath(work: Pick<RevivalWork, "id">) {
  return `/revival/${work.id}`;
}

export const RUNTIME_BANDS = [
  { id: "short", label: "Under ten minutes", max: 600 },
  { id: "half", label: "Ten to thirty minutes", max: 1_800 },
  { id: "hour", label: "Half an hour to an hour", max: 3_600 },
  { id: "feature", label: "An hour or more", max: Number.POSITIVE_INFINITY },
] as const;

export function runtimeBand(seconds: number | null) {
  if (seconds === null || seconds <= 0) {
    return null;
  }

  return RUNTIME_BANDS.find((band) => seconds < band.max) ?? null;
}

export function tagSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 60);
}

export function runtimeLabel(seconds: number | null) {
  if (!seconds) {
    return null;
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function workMeta(work: RevivalWork) {
  return [
    work.year?.toString(),
    work.country,
    work.kind === "short" ? "Short" : work.kind === "ephemeral" ? "Ephemeral" : null,
    runtimeLabel(work.runtimeSeconds),
    work.director,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function rightsSummary(work: RevivalWork) {
  const label = RIGHTS_LABELS[work.rightsBasis];

  if (!work.ukExpiresYear) {
    return label;
  }

  if (!work.ukClear) {
    return `${label} · not free in the UK before ${work.ukExpiresYear}`;
  }

  return work.rightsBasis === "uk-expired"
    ? `Free in the UK since ${work.ukExpiresYear}`
    : `${label} · free in the UK since ${work.ukExpiresYear}`;
}

export function clockLabel(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(whole / 60) % 60).padStart(2, "0");
  const rest = String(whole % 60).padStart(2, "0");
  const hours = Math.floor(whole / 3_600);

  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
