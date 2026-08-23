import { runtimeBand } from "../../src/domain/revival.ts";
import type {
  RevivalShelf,
  RevivalSource,
  RevivalStatus,
  RevivalTagKind,
  RevivalWork,
} from "../../src/domain/revival.ts";
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
const MAX_SHELVES = 18;
const GENRE_SHELVES = 5;
const SUBJECT_SHELVES = 4;
const COUNTRY_SHELVES = 3;
const PERSON_SHELVES = 3;
const RUNTIME_SHELVES = 2;
const DECADE_SHELVES = 3;
const SHELF_MIN = 3;

export function usPublicDomainCutoff(now = new Date()) {
  return now.getUTCFullYear() - US_TERM_YEARS;
}

export function decideStatus(candidate: RevivalCandidate, source: RevivalSource): RevivalStatus {
  if (!candidate.streamUrl || (candidate.runtimeSeconds ?? 0) < MIN_RUNTIME_SECONDS) {
    return "rejected";
  }

  if (
    source === "europeana" &&
    (candidate.rightsBasis === "cc0" || candidate.rightsBasis === "eu-institution")
  ) {
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
      const status = decideStatus(candidate, "archive");

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
    const status = decideStatus(candidate, "loc");

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
    const status = decideStatus({ ...candidate, runtimeSeconds: MIN_RUNTIME_SECONDS }, "europeana");

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

type Grouped = { key: string; label: string; works: RevivalWork[] };

function groupBy(
  works: RevivalWork[],
  placed: Set<string>,
  pick: (work: RevivalWork) => { key: string; label: string }[],
) {
  const groups = new Map<string, Grouped>();

  for (const work of works) {
    if (placed.has(work.id)) {
      continue;
    }

    for (const { key, label } of pick(work)) {
      const group = groups.get(key) ?? { key, label, works: [] };

      group.works.push(work);
      groups.set(key, group);
    }
  }

  return [...groups.values()].sort((left, right) => right.works.length - left.works.length);
}

function tagsOf(work: RevivalWork, kind: RevivalTagKind) {
  return work.tags
    .filter((tag) => tag.kind === kind)
    .map((tag) => ({ key: `${kind}:${tag.slug}`, label: tag.label }));
}

export function buildShelves(works: RevivalWork[]) {
  const shelves: RevivalShelf[] = [];
  const placed = new Set<string>();
  const topics = new Set<string>();
  const add = (id: string, title: string, description: string, items: RevivalWork[]) => {
    if (items.length < SHELF_MIN || shelves.length >= MAX_SHELVES) {
      return;
    }

    for (const work of items) {
      placed.add(work.id);
    }

    shelves.push(shelf(id, title, description, items.slice(0, SHELF_LIMIT)));
  };

  const addGroups = (
    groups: Grouped[],
    limit: number,
    title: (group: Grouped) => string,
    description: (group: Grouped) => string,
  ) => {
    let used = 0;

    for (const group of groups) {
      if (used >= limit) {
        return;
      }

      const topic = group.key.split(":").slice(1).join(":");

      if (topics.has(topic)) {
        continue;
      }

      const before = shelves.length;

      add(
        group.key,
        title(group),
        description(group),
        group.works.filter((work) => !placed.has(work.id)),
      );

      if (shelves.length > before) {
        topics.add(topic);
        used += 1;
      }
    }
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
    works.filter((work) => HOME_NATIONS.has(work.country ?? "")),
  );

  addGroups(
    groupBy(works, placed, (work) => tagsOf(work, "genre")),
    GENRE_SHELVES,
    (group) => group.label,
    (group) => `${group.works.length} of them, filed under ${group.label.toLowerCase()}.`,
  );

  addGroups(
    groupBy(works, placed, (work) => tagsOf(work, "subject")),
    SUBJECT_SHELVES,
    (group) => group.label,
    () => "Everything we hold on the subject.",
  );

  addGroups(
    groupBy(works, placed, (work) =>
      work.country ? [{ key: `country:${work.country}`, label: work.country }] : [],
    ),
    COUNTRY_SHELVES,
    (group) => `From ${group.label}`,
    (group) => `Held by archives in ${group.label} and released by them.`,
  );

  addGroups(
    groupBy(works, placed, (work) => tagsOf(work, "person")),
    PERSON_SHELVES,
    (group) => group.label,
    () => "Their work, as far as we hold it.",
  );

  addGroups(
    groupBy(works, placed, (work) => {
      const band = runtimeBand(work.runtimeSeconds);

      return band ? [{ key: `runtime:${band.id}`, label: band.label }] : [];
    }),
    RUNTIME_SHELVES,
    (group) => group.label,
    () => "Picked by how much of an evening it wants.",
  );

  addGroups(
    groupBy(works, placed, (work) =>
      work.kind === "feature" && work.year !== null
        ? [{ key: `decade:${decadeOf(work.year)}`, label: `The ${decadeOf(work.year)}s` }]
        : [],
    ),
    DECADE_SHELVES,
    (group) => group.label,
    (group) => `${group.works.length} from the decade.`,
  );

  add(
    "shorts",
    "Shorts and serials",
    "The bit before the main feature.",
    works.filter((work) => !placed.has(work.id) && work.kind === "short"),
  );

  add(
    "ephemera",
    "Ephemera",
    "Industrial films, adverts and instructional reels. Stranger than the features.",
    works.filter((work) => !placed.has(work.id) && work.kind === "ephemeral"),
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
