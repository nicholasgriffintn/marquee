import type { ContentGate } from "./access";
import { slugify } from "./slug";

export type RevivalSource = "archive" | "loc" | "europeana" | "wikidata";

export type RevivalKind = "feature" | "short" | "episode" | "ephemeral";

const SHORT_MAX_SECONDS = 45 * 60;

export function runtimeKind(seconds: number | null): RevivalKind {
  return seconds !== null && seconds <= SHORT_MAX_SECONDS ? "short" : "feature";
}

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

export const WIKIPEDIA_TEXT_LICENCE = {
  name: "CC BY-SA 4.0",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
};

export type RevivalSynopsisCredit = { article: string; url: string };

export type RevivalWork = {
  id: string;
  source: RevivalSource;
  sourceUrl: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  synopsisCredit: RevivalSynopsisCredit | null;
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
  popularity: number | null;
  downloads: number | null;
  groupId: string | null;
  streamBytes: number | null;
  height: number | null;
  condition: PrintCondition;
  contentNotice: string | null;
  gate: ContentGate | null;
  tags: RevivalTag[];
};

export const CARD_FIELDS = [
  "id",
  "title",
  "year",
  "country",
  "kind",
  "runtimeSeconds",
  "director",
  "stillUrl",
  "mirrored",
  "condition",
] as const;

export type RevivalCard = Pick<RevivalWork, (typeof CARD_FIELDS)[number]>;

export function toCard(work: RevivalWork): RevivalCard {
  return {
    id: work.id,
    title: work.title,
    year: work.year,
    country: work.country,
    kind: work.kind,
    runtimeSeconds: work.runtimeSeconds,
    director: work.director,
    stillUrl: work.stillUrl,
    mirrored: work.mirrored,
    condition: work.condition,
  };
}

export type RevivalBillSlotOf<T> = {
  slot: string;
  note: string;
  work: T;
};

export type RevivalShelfOf<T> = {
  id: string;
  title: string;
  description: string;
  works: T[];
};

export type RevivalBillSlot = RevivalBillSlotOf<RevivalCard>;

export type RevivalShelf = RevivalShelfOf<RevivalCard>;

export type RevivalBillResponse = {
  bill: RevivalBillSlot[];
  billDate: string;
  fetchedAt: string;
};

export type RevivalShelvesResponse = {
  shelves: RevivalShelf[];
  fetchedAt: string;
};

export type RevivalPrint = {
  id: string;
  source: RevivalSource;
  sourceUrl: string;
  title: string;
  runtimeSeconds: number | null;
  condition: RevivalWork["condition"];
  streamBytes: number | null;
  height: number | null;
  downloads: number | null;
  mirrored: boolean;
};

export function toPrint(work: RevivalWork): RevivalPrint {
  return {
    id: work.id,
    source: work.source,
    sourceUrl: work.sourceUrl,
    title: work.title,
    runtimeSeconds: work.runtimeSeconds,
    condition: work.condition,
    streamBytes: work.streamBytes,
    height: work.height,
    downloads: work.downloads,
    mirrored: work.mirrored,
  };
}

export function printMeta(print: RevivalPrint) {
  const megabytes = print.streamBytes ? Math.round(print.streamBytes / 1_048_576) : null;

  return [
    print.mirrored ? "Our print" : SOURCE_LABELS[print.source],
    runtimeLabel(print.runtimeSeconds),
    print.height ? `${print.height}p` : null,
    megabytes ? `${megabytes} MB` : null,
    print.condition === "rough" ? "rough print" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type RevivalScreening = {
  work: RevivalWork;
  prints: RevivalPrint[];
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
  wikidata: "Wikimedia Commons",
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
    return `Hosted by ${SOURCE_LABELS[work.source]}`;
  }

  return work.mirrored
    ? `Hosted here, copied from ${SOURCE_LABELS[work.source]}`
    : `Hosted by ${SOURCE_LABELS[work.source]}, relayed through us`;
}

export function revivalPath(work: Pick<RevivalCard, "id">) {
  return `/revival/${work.id}`;
}

export const HUB_FAMILIES = [
  "decade",
  "director",
  "genre",
  "subject",
  "country",
  "person",
] as const;

export type HubFamily = (typeof HUB_FAMILIES)[number];

export type RevivalGroup = { slug: string; label: string; size: number };

export type RevivalHubs = {
  decades: RevivalGroup[];
  directors: RevivalGroup[];
  genres: RevivalGroup[];
};

export function isHubFamily(value: unknown): value is HubFamily {
  return HUB_FAMILIES.includes(value as HubFamily);
}

export function hubPath(family: HubFamily, slug: string) {
  return `/revival/shelf/${family}/${encodeURIComponent(slug)}`;
}

export function hubTitle(family: HubFamily, label: string) {
  if (family === "decade") {
    return `The ${label}s`;
  }

  if (family === "country") {
    return `From ${label}`;
  }

  return label;
}

export const REVIVAL_TERM_PATH = "/revival/the-term";

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
  return slugify(value);
}

/** The soundest print on offer: our own copy first, and never a rough one if there is a choice. */
export function bestPrint<T extends { mirrored: boolean; condition: PrintCondition }>(prints: T[]) {
  const watchable = prints.filter((print) => print.condition !== "rough");

  return watchable.find((print) => print.mirrored) ?? watchable[0] ?? prints[0];
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

export function workMeta(work: RevivalCard) {
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
  if (work.rightsBasis === "uk-expired" && work.ukExpiresYear) {
    return `UK copyright expired in ${work.ukExpiresYear - 1}`;
  }

  if (work.rightsBasis === "eu-institution" || work.rightsBasis === "cc0") {
    return `Released as public domain by ${SOURCE_LABELS[work.source]}`;
  }

  if (work.rightsBasis === "us-gov" || work.rightsBasis === "curated") {
    return `${SOURCE_LABELS[work.source]} offers this as free to use`;
  }

  if (work.rightsBasis === "unclear") {
    return "No public domain claim on the source record";
  }

  return "Source record marks this copy as public domain";
}

export function ukStanding(work: RevivalWork) {
  if (work.ukClear && work.ukExpiresYear) {
    return `Out of UK copyright since ${work.ukExpiresYear}`;
  }

  if (work.ukExpiresYear) {
    return `UK term runs to ${work.ukExpiresYear} on the dates we could find`;
  }

  return "UK term not established";
}

export function clockLabel(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(whole / 60) % 60).padStart(2, "0");
  const rest = String(whole % 60).padStart(2, "0");
  const hours = Math.floor(whole / 3_600);

  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
