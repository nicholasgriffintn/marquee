import type { RevivalShelf, RevivalStatus, RevivalWork } from "../../src/domain/revival.ts";
import {
  ARCHIVE_COLLECTIONS,
  readArchiveItem,
  searchArchiveCollection,
  type ArchiveCandidate,
} from "../clients/archive.ts";
import { EUROPEANA_COUNTRIES, searchEuropeana } from "../clients/europeana.ts";
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

const US_TERM_YEARS = 96;
const MIN_RUNTIME_SECONDS = 60;
const NOW_SHOWING = 12;
const HOME_NATIONS = new Set(["United Kingdom", "Ireland"]);
const ARCHIVE_LANES = 5;
const ARCHIVE_BUDGET_MS = 45_000;
const ARCHIVE_PAGE = 25;
const SHELF_LIMIT = 40;
const SHELF_MIN = 3;

export function usPublicDomainCutoff(now = new Date()) {
  return now.getUTCFullYear() - US_TERM_YEARS;
}

export function decideStatus(candidate: RevivalCandidate): RevivalStatus {
  if (!candidate.streamUrl || (candidate.runtimeSeconds ?? 0) < MIN_RUNTIME_SECONDS) {
    return "rejected";
  }

  if (candidate.rightsBasis === "cc0" || candidate.rightsBasis === "eu-institution") {
    return "approved";
  }

  return "candidate";
}

function withUsExpiredBasis(candidate: ArchiveCandidate, cutoff: number): RevivalCandidate {
  if (candidate.rightsBasis !== "unclear" || candidate.year === null || candidate.year > cutoff) {
    return candidate;
  }

  return {
    ...candidate,
    rightsBasis: "us-expired",
    rightsNote: `Published ${candidate.year}, outside the ${US_TERM_YEARS} year US term. The UK term is measured from the authors' deaths and still has to be checked.`,
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
  const cutoff = usPublicDomainCutoff();
  const cursor = parseCursor(await readSourceCursor(env.DB, "archive"));
  const page = cursor[collection] ?? 1;
  const { identifiers, total } = await searchArchiveCollection(collection, page, cutoff);
  const counts = { seen: 0, accepted: 0, rejected: 0 };
  const deadline = Date.now() + ARCHIVE_BUDGET_MS;
  let cut = false;

  for (let index = 0; index < identifiers.length; index += ARCHIVE_LANES) {
    if (Date.now() > deadline) {
      cut = true;

      break;
    }

    const lane = identifiers.slice(index, index + ARCHIVE_LANES);

    // oxlint-disable-next-line no-await-in-loop
    const items = await Promise.all(
      lane.map(async (identifier) => {
        try {
          return await readArchiveItem(identifier);
        } catch (error) {
          logError("revival_archive_item_failed", error, { area: "revival", identifier });

          return null;
        }
      }),
    );

    for (const item of items) {
      counts.seen += 1;

      if (!item) {
        counts.rejected += 1;

        continue;
      }

      const candidate = withUsExpiredBasis(item, cutoff);
      const status = decideStatus(candidate);

      // oxlint-disable-next-line no-await-in-loop
      await upsertWork(env.DB, "archive", candidate, status);

      if (status === "approved") {
        counts.accepted += 1;
      } else {
        counts.rejected += 1;
      }
    }
  }

  const exhausted = identifiers.length === 0 || page * ARCHIVE_PAGE >= total;
  const next = cut ? page : exhausted ? 1 : page + 1;

  await recordSourceRun(
    env.DB,
    "archive",
    JSON.stringify({ ...cursor, [collection]: next }),
    counts,
  );

  return { collection, page, ...counts };
}

export async function syncScreeningRoom(env: Bindings) {
  const cursor = parseCursor(await readSourceCursor(env.DB, "loc"));
  const page = cursor.nsr ?? 1;
  const { candidates, hasMore } = await searchScreeningRoom(page);
  const counts = { seen: candidates.length, accepted: 0, rejected: 0 };

  for (const candidate of candidates) {
    const status = decideStatus(candidate);

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

export async function syncEuropeanaCountry(env: Bindings, country: string) {
  if (!env.EUROPEANA_API_KEY) {
    return { country, seen: 0, accepted: 0, rejected: 0 };
  }

  const cursor = parseCursor(await readSourceCursor(env.DB, "europeana"));
  const page = cursor[country] ?? 1;
  const { candidates, total } = await searchEuropeana(env.EUROPEANA_API_KEY, country, page);
  const counts = { seen: candidates.length, accepted: 0, rejected: 0 };

  for (const candidate of candidates) {
    const status = decideStatus({ ...candidate, runtimeSeconds: MIN_RUNTIME_SECONDS });

    // oxlint-disable-next-line no-await-in-loop
    await upsertWork(env.DB, "europeana", candidate, status);

    if (status === "approved") {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
  }

  const exhausted = candidates.length === 0 || page * 100 >= total;

  await recordSourceRun(
    env.DB,
    "europeana",
    JSON.stringify({ ...cursor, [country]: exhausted ? 1 : page + 1 }),
    counts,
  );

  return { country, page, ...counts };
}

export async function queueRevivalSources(env: Bindings) {
  const jobs = [
    { body: { type: "sync-revival-source" as const, source: "loc" as const } },
    ...(env.EUROPEANA_API_KEY
      ? EUROPEANA_COUNTRIES.map((country) => ({
          body: {
            type: "sync-revival-source" as const,
            source: "europeana" as const,
            collection: country,
          },
        }))
      : []),
    ...ARCHIVE_COLLECTIONS.map((collection) => ({
      body: { type: "sync-revival-source" as const, source: "archive" as const, collection },
    })),
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
  const shelves: RevivalShelf[] = [];
  const placed = new Set<string>();
  const take = (matches: (work: RevivalWork) => boolean) =>
    works.filter((work) => !placed.has(work.id) && matches(work)).slice(0, SHELF_LIMIT);
  const add = (id: string, title: string, description: string, items: RevivalWork[]) => {
    if (items.length < SHELF_MIN) {
      return;
    }

    for (const work of items) {
      placed.add(work.id);
    }

    shelves.push(shelf(id, title, description, items));
  };

  const showable = works.filter((work) => work.kind === "feature" || work.kind === "short");

  if (showable.length) {
    shelves.push(
      shelf(
        "now-showing",
        "On tonight",
        "Running now, on our own screen. No sign-in, no service, no rental.",
        showable.slice(0, NOW_SHOWING),
      ),
    );
  }

  add(
    "british",
    "Made here",
    "British and Irish prints, out of copyright and back on a screen.",
    take((work) => HOME_NATIONS.has(work.country ?? "")),
  );

  add(
    "european",
    "From the continent",
    "Held by European archives and released by them for anyone to use.",
    take((work) => Boolean(work.country) && work.source === "europeana"),
  );

  const decades = new Map<number, RevivalWork[]>();

  for (const work of works) {
    if (work.kind !== "feature" || work.year === null || placed.has(work.id)) {
      continue;
    }

    const decade = decadeOf(work.year);

    decades.set(decade, [...(decades.get(decade) ?? []), work]);
  }

  for (const [decade, items] of [...decades].sort(([left], [right]) => left - right)) {
    add(
      `decade-${decade}`,
      `The ${decade}s`,
      `${items.length} feature${items.length === 1 ? "" : "s"} from the ${decade}s.`,
      [...items].sort((left, right) => (left.year ?? 0) - (right.year ?? 0)).slice(0, SHELF_LIMIT),
    );
  }

  add(
    "shorts",
    "Shorts and serials",
    "The bit before the main feature.",
    take((work) => work.kind === "short"),
  );

  add(
    "ephemera",
    "Ephemera",
    "Industrial films, adverts and instructional reels. Stranger than the features.",
    take((work) => work.kind === "ephemeral"),
  );

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
