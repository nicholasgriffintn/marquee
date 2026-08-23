import type { RevivalShelf, RevivalStatus, RevivalWork } from "../../src/domain/revival.ts";
import {
  ARCHIVE_COLLECTIONS,
  readArchiveItem,
  searchArchiveCollection,
  type ArchiveCandidate,
} from "../clients/archive.ts";
import { searchScreeningRoom } from "../clients/loc.ts";
import { logError } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import {
  readApprovedWorks,
  readProgress,
  readSourceCursor,
  readViewerProgress,
  readWork,
  recordMatch,
  recordSourceRun,
  selectUnmatched,
  upsertWork,
  type RevivalCandidate,
} from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";
import { findTitleForFilm } from "./cinema-matching.ts";

const COPYRIGHT_TERM_YEARS = 96;
const MIN_RUNTIME_SECONDS = 60;
const NOW_SHOWING = 12;
const DECADE_MIN = 3;

export function publicDomainCutoff(now = new Date()) {
  return now.getUTCFullYear() - COPYRIGHT_TERM_YEARS;
}

export function decideStatus(candidate: RevivalCandidate, cutoff: number): RevivalStatus {
  if (!candidate.streamUrl || (candidate.runtimeSeconds ?? 0) < MIN_RUNTIME_SECONDS) {
    return "rejected";
  }

  if (candidate.rightsBasis === "us-gov" || candidate.rightsBasis === "curated") {
    return "approved";
  }

  if (candidate.rightsBasis === "cc0") {
    return "approved";
  }

  if (candidate.rightsBasis === "pd-mark") {
    return candidate.year !== null && candidate.year <= cutoff ? "approved" : "candidate";
  }

  return "candidate";
}

function withExpiredBasis(candidate: ArchiveCandidate, cutoff: number): RevivalCandidate {
  if (candidate.rightsBasis !== "unclear" || candidate.year === null || candidate.year > cutoff) {
    return candidate;
  }

  return {
    ...candidate,
    rightsBasis: "copyright-expired",
    rightsNote: `Published ${candidate.year}, outside the ${COPYRIGHT_TERM_YEARS} year US term`,
  };
}

function parseCursor(raw: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");

    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === "number" && Number.isInteger(value) && value > 0 ? [[key, value]] : [],
      ),
    );
  } catch {
    return {};
  }
}

export async function syncArchiveCollection(env: Bindings, collection: string) {
  const cutoff = publicDomainCutoff();
  const cursor = parseCursor(await readSourceCursor(env.DB, "archive"));
  const page = cursor[collection] ?? 1;
  const { identifiers, total } = await searchArchiveCollection(collection, page, cutoff);
  const counts = { seen: 0, accepted: 0, rejected: 0 };

  for (const identifier of identifiers) {
    counts.seen += 1;

    try {
      // oxlint-disable-next-line no-await-in-loop
      const item = await readArchiveItem(identifier);

      if (!item) {
        counts.rejected += 1;

        continue;
      }

      const candidate = withExpiredBasis(item, cutoff);
      const status = decideStatus(candidate, cutoff);

      // oxlint-disable-next-line no-await-in-loop
      await upsertWork(env.DB, "archive", candidate, status);

      if (status === "approved") {
        counts.accepted += 1;
      } else {
        counts.rejected += 1;
      }
    } catch (error) {
      counts.rejected += 1;
      logError("revival_archive_item_failed", error, { area: "revival", identifier });
    }
  }

  const exhausted = identifiers.length === 0 || page * 50 >= total;

  await recordSourceRun(
    env.DB,
    "archive",
    JSON.stringify({ ...cursor, [collection]: exhausted ? 1 : page + 1 }),
    counts,
  );

  return { collection, page, ...counts };
}

export async function syncScreeningRoom(env: Bindings) {
  const cutoff = publicDomainCutoff();
  const cursor = parseCursor(await readSourceCursor(env.DB, "loc"));
  const page = cursor.nsr ?? 1;
  const { candidates, hasMore } = await searchScreeningRoom(page);
  const counts = { seen: candidates.length, accepted: 0, rejected: 0 };

  for (const candidate of candidates) {
    const status = decideStatus(candidate, cutoff);

    // oxlint-disable-next-line no-await-in-loop
    await upsertWork(env.DB, "loc", candidate, status);

    if (status === "approved") {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
  }

  await recordSourceRun(env.DB, "loc", JSON.stringify({ nsr: hasMore ? page + 1 : 1 }), counts);

  return { page, ...counts };
}

export async function queueRevivalSources(env: Bindings) {
  const jobs = [
    ...ARCHIVE_COLLECTIONS.map((collection) => ({
      body: { type: "sync-revival-source" as const, source: "archive" as const, collection },
    })),
    { body: { type: "sync-revival-source" as const, source: "loc" as const } },
  ];

  await env.INGESTION_QUEUE.sendBatch(jobs);

  return jobs.length;
}

export async function matchRevivalWorks(env: Bindings, limit = 40) {
  const pending = await selectUnmatched(env.DB, limit);
  let matched = 0;

  for (const work of pending) {
    // oxlint-disable-next-line no-await-in-loop
    const result = await findTitleForFilm(env.DB, {
      sourceFilmId: work.id,
      sourceTitle: work.title,
      sourceYear: work.year,
      runtimeMinutes: work.runtimeSeconds ? Math.round(work.runtimeSeconds / 60) : null,
    });

    // oxlint-disable-next-line no-await-in-loop
    await recordMatch(env.DB, work.id, result.titleId, result.confidence);

    if (result.titleId) {
      matched += 1;
    }
  }

  return { considered: pending.length, matched };
}

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

function shelf(id: string, title: string, description: string, works: RevivalWork[]) {
  return { id, title, description, works } satisfies RevivalShelf;
}

export function buildShelves(works: RevivalWork[]) {
  const features = works.filter((work) => work.kind === "feature");
  const shorts = works.filter((work) => work.kind === "short");
  const ephemera = works.filter((work) => work.kind === "ephemeral");
  const shelves: RevivalShelf[] = [];

  if (features.length || shorts.length) {
    shelves.push(
      shelf(
        "now-showing",
        "On tonight",
        "Running now, on our own screen. No sign-in, no service, no rental.",
        [...features, ...shorts].slice(0, NOW_SHOWING),
      ),
    );
  }

  const decades = new Map<number, RevivalWork[]>();

  for (const work of features) {
    if (work.year === null) {
      continue;
    }

    const decade = decadeOf(work.year);

    decades.set(decade, [...(decades.get(decade) ?? []), work]);
  }

  for (const [decade, items] of [...decades].sort(([left], [right]) => left - right)) {
    if (items.length < DECADE_MIN) {
      continue;
    }

    shelves.push(
      shelf(
        `decade-${decade}`,
        `The ${decade}s`,
        `${items.length} feature${items.length === 1 ? "" : "s"} from the ${decade}s.`,
        [...items].sort((left, right) => (left.year ?? 0) - (right.year ?? 0)),
      ),
    );
  }

  if (shorts.length) {
    shelves.push(shelf("shorts", "Shorts and serials", "The bit before the main feature.", shorts));
  }

  if (ephemera.length) {
    shelves.push(
      shelf(
        "ephemera",
        "Ephemera",
        "Industrial films, adverts and instructional reels. Stranger than the features.",
        ephemera,
      ),
    );
  }

  return shelves;
}

export async function getProgramme(env: Bindings, viewerId: string | null) {
  const works = await readApprovedWorks(env.DB);
  const shelves = buildShelves(works);

  if (viewerId) {
    const progress = await readViewerProgress(env.DB, viewerId);
    const byId = new Map(works.map((work) => [work.id, work]));
    const resuming = progress.flatMap((entry) => {
      const work = byId.get(entry.id);

      return work ? [work] : [];
    });

    if (resuming.length) {
      shelves.unshift(
        shelf("resume", "Where you left off", "The lights are still down on these.", resuming),
      );
    }
  }

  return { shelves, total: works.length, fetchedAt: new Date().toISOString() };
}

export async function getScreening(env: Bindings, id: string, viewerId: string | null) {
  const work = await readWork(env.DB, id);

  if (!work) {
    return null;
  }

  const [progress, approved] = await Promise.all([
    viewerId
      ? readProgress(env.DB, viewerId, id)
      : Promise.resolve({ positionSeconds: 0, finished: false }),
    readApprovedWorks(env.DB, 60),
  ]);

  const alsoShowing = approved
    .filter((other) => other.id !== work.id && other.kind === work.kind)
    .slice(0, 8);

  return { work, ...progress, alsoShowing };
}
