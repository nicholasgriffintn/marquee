export type RevivalSource = "archive" | "loc";

export type RevivalKind = "feature" | "short" | "episode" | "ephemeral";

export type RevivalRightsBasis =
  | "us-gov"
  | "pd-mark"
  | "cc0"
  | "copyright-expired"
  | "curated"
  | "unclear";

export type RevivalStatus = "candidate" | "approved" | "rejected";

export type RevivalMirrorState = "remote" | "copying" | "mirrored" | "failed";

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
  mirrored: boolean;
  reelUrl: string;
  plays: number;
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
  "us-gov": "US Government work",
  "pd-mark": "Public Domain Mark",
  cc0: "CC0 dedication",
  "copyright-expired": "Copyright expired",
  curated: "Cleared by hand",
  unclear: "Not established",
};

export const SOURCE_LABELS: Record<RevivalSource, string> = {
  archive: "Internet Archive",
  loc: "Library of Congress",
};

export function reelPath(workId: string) {
  return `/media/reel/${workId}`;
}

export function revivalPath(work: Pick<RevivalWork, "id">) {
  return `/revival/${work.id}`;
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
    work.kind === "short" ? "Short" : work.kind === "ephemeral" ? "Ephemeral" : null,
    runtimeLabel(work.runtimeSeconds),
    work.director,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function clockLabel(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(whole / 60) % 60).padStart(2, "0");
  const rest = String(whole % 60).padStart(2, "0");
  const hours = Math.floor(whole / 3_600);

  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
