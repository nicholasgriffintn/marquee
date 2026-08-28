import { assertsPublicDomain, RUNTIME_BANDS, toCard, toPrint } from "../../src/domain/revival.ts";
import type { RevivalStatus, RevivalWork } from "../../src/domain/revival.ts";
import {
  ARCHIVE_COLLECTIONS,
  archivePageCap,
  archivePopularity,
  readArchiveItem,
  searchArchiveCollection,
  type ArchiveCandidate,
} from "../clients/archive.ts";
import { EUROPEANA_COUNTRIES, searchEuropeana } from "../clients/europeana.ts";
import { searchScreeningRoom } from "../clients/loc.ts";
import { searchCommonsFilms } from "../clients/wikidata-films.ts";
import { logError } from "../lib/logging.ts";
import { billDay, lateNight, seedFrom, shuffler, standingOffset } from "../lib/revival-bill.ts";
import { isRecord } from "../lib/values.ts";
import {
  deleteWork,
  countApproved,
  countShelf,
  readAlsoShowing,
  readCountryGroups,
  readDecadeGroups,
  readGroupPrints,
  readProgress,
  readShelfPage,
  readTagGroups,
  readWorksByIds,
  readSourceCursor,
  readViewerProgress,
  readWork,
  recordMatch,
  recordSourceRun,
  refreshPopularity,
  selectKnownSourceIds,
  selectArchiveForRecheck,
  selectUnmatched,
  upsertWork,
  type RevivalCandidate,
  type ShelfGroup,
  type ShelfSelector,
} from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";
import { findTitleForFilm } from "./cinema-matching.ts";
import { ukClearedDeathCutoff } from "./revival-rights.ts";

const US_TERM_YEARS = 96;
const MIN_RUNTIME_SECONDS = 60;
const ARCHIVE_LANES = 5;
const ARCHIVE_BUDGET_MS = 45_000;
const ARCHIVE_PAGE = 25;
const CURATED_POPULARITY = 550;
const KNOWN_FRESH_DAYS = 30;
const MATCH_BATCH = 200;
const MATCH_BUDGET_MS = 20_000;
const GENRE_SHELVES = 5;
const SUBJECT_SHELVES = 4;
const COUNTRY_SHELVES = 3;
const PERSON_SHELVES = 3;
const RUNTIME_SHELVES = 2;
const DECADE_SHELVES = 3;
const SHELF_MIN = 3;
const RAIL_LENGTH = 40;
const MAX_RUNTIME = 86_400;
const DRAW_BATCH = 12;
const DRAW_ATTEMPTS = 3;

export function usPublicDomainCutoff(now = new Date()) {
  return now.getUTCFullYear() - US_TERM_YEARS;
}

export function decideStatus(candidate: RevivalCandidate): RevivalStatus {
  if (!candidate.streamUrl || (candidate.runtimeSeconds ?? 0) < MIN_RUNTIME_SECONDS) {
    return "rejected";
  }

  return assertsPublicDomain(candidate.rightsBasis) ? "approved" : "candidate";
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
  const { entries, total } = await searchArchiveCollection(collection, page, cutoff);
  const counts = { seen: 0, accepted: 0, rejected: 0, skipped: 0 };
  const deadline = Date.now() + ARCHIVE_BUDGET_MS;

  await refreshPopularity(
    env.DB,
    "archive",
    entries.map((entry) => ({
      sourceId: entry.identifier,
      popularity: archivePopularity(entry.downloads),
      downloads: entry.downloads,
    })),
  );

  const known = await selectKnownSourceIds(
    env.DB,
    "archive",
    entries.map((entry) => entry.identifier),
    KNOWN_FRESH_DAYS,
  );
  const pending = entries.filter((entry) => !known.has(entry.identifier));

  counts.skipped = entries.length - pending.length;

  let cut = false;

  for (let index = 0; index < pending.length; index += ARCHIVE_LANES) {
    if (Date.now() > deadline) {
      cut = true;

      break;
    }

    const lane = pending.slice(index, index + ARCHIVE_LANES);

    // oxlint-disable-next-line no-await-in-loop
    const items = await Promise.all(
      lane.map(async (entry) => {
        try {
          return await readArchiveItem(entry.identifier, entry.downloads);
        } catch (error) {
          logError("revival_archive_item_failed", error, {
            area: "revival",
            identifier: entry.identifier,
          });

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

  const drained = entries.length === 0 || page >= archivePageCap() || page * ARCHIVE_PAGE >= total;
  const next = cut ? page : drained ? 1 : page + 1;

  await recordSourceRun(
    env.DB,
    "archive",
    JSON.stringify({ ...cursor, [collection]: next }),
    counts,
  );

  return { collection, page, exhausted: drained && !cut, ...counts };
}

export async function syncScreeningRoom(env: Bindings) {
  const cursor = parseCursor(await readSourceCursor(env.DB, "loc"));
  const page = cursor.nsr ?? 1;
  const { candidates, hasMore } = await searchScreeningRoom(page);
  const counts = { seen: candidates.length, accepted: 0, rejected: 0 };

  for (const candidate of candidates) {
    const status = decideStatus(candidate);

    // oxlint-disable-next-line no-await-in-loop
    await upsertWork(env.DB, "loc", { ...candidate, popularity: CURATED_POPULARITY }, status);

    if (status === "approved") {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
  }

  await recordSourceRun(env.DB, "loc", JSON.stringify({ nsr: hasMore ? page + 1 : 1 }), counts);

  return { page, exhausted: !hasMore, ...counts };
}

export async function syncEuropeanaCountry(env: Bindings, country: string) {
  if (!env.EUROPEANA_API_KEY) {
    return { country, exhausted: true, seen: 0, accepted: 0, rejected: 0 };
  }

  const cursor = parseCursor(await readSourceCursor(env.DB, "europeana"));
  const page = cursor[country] ?? 1;
  const { candidates, total } = await searchEuropeana(env.EUROPEANA_API_KEY, country, page);
  const counts = { seen: candidates.length, accepted: 0, rejected: 0 };

  for (const candidate of candidates) {
    const status = decideStatus({
      ...candidate,
      runtimeSeconds: MIN_RUNTIME_SECONDS,
    });

    // oxlint-disable-next-line no-await-in-loop
    await upsertWork(env.DB, "europeana", { ...candidate, popularity: CURATED_POPULARITY }, status);

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

  return { country, page, exhausted, ...counts };
}

export async function syncCommonsFilms(env: Bindings) {
  const cursor = parseCursor(await readSourceCursor(env.DB, "wikidata"));
  const page = cursor.films ?? 1;
  const { candidates, seen, exhausted } = await searchCommonsFilms(page, ukClearedDeathCutoff());
  const counts = { seen, accepted: 0, rejected: seen - candidates.length };

  for (const candidate of candidates) {
    const status = decideStatus(candidate);

    // oxlint-disable-next-line no-await-in-loop
    await upsertWork(env.DB, "wikidata", { ...candidate, popularity: CURATED_POPULARITY }, status);

    if (status === "approved") {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
  }

  await recordSourceRun(
    env.DB,
    "wikidata",
    JSON.stringify({ films: exhausted ? 1 : page + 1 }),
    counts,
  );

  return { page, exhausted, ...counts };
}

export async function queueRevivalSources(env: Bindings) {
  const jobs = [
    {
      body: {
        type: "sync-revival-source" as const,
        source: "loc" as const,
        chain: true,
      },
    },
    ...(env.EUROPEANA_API_KEY
      ? EUROPEANA_COUNTRIES.map((country) => ({
          body: {
            type: "sync-revival-source" as const,
            source: "europeana" as const,
            collection: country,
            chain: true,
          },
        }))
      : []),
    {
      body: {
        type: "sync-revival-source" as const,
        source: "wikidata" as const,
        chain: true,
      },
    },
    ...ARCHIVE_COLLECTIONS.map((collection) => ({
      body: {
        type: "sync-revival-source" as const,
        source: "archive" as const,
        collection,
        chain: true,
      },
    })),
  ];

  await env.INGESTION_QUEUE.sendBatch(jobs);

  return jobs.length;
}

export async function recheckArchiveWorks(env: Bindings, limit = 80) {
  const cutoff = usPublicDomainCutoff();
  const pending = await selectArchiveForRecheck(env.DB, limit, KNOWN_FRESH_DAYS);
  const deadline = Date.now() + ARCHIVE_BUDGET_MS;
  const counts = { checked: 0, removed: 0, skipped: 0, refreshed: 0 };

  for (let index = 0; index < pending.length; index += ARCHIVE_LANES) {
    if (Date.now() > deadline) {
      break;
    }

    const lane = pending.slice(index, index + ARCHIVE_LANES);

    // oxlint-disable-next-line no-await-in-loop
    const verdicts = await Promise.all(
      lane.map(async (row) => {
        try {
          return {
            row,
            item: await readArchiveItem(row.sourceId),
            failed: false,
          };
        } catch {
          return { row, item: null, failed: true };
        }
      }),
    );

    for (const verdict of verdicts) {
      counts.checked += 1;

      if (verdict.failed) {
        counts.skipped += 1;

        continue;
      }

      if (verdict.item) {
        const candidate = withUsExpiredBasis(verdict.item, cutoff);

        // oxlint-disable-next-line no-await-in-loop
        await upsertWork(env.DB, "archive", candidate, decideStatus(candidate));
        counts.refreshed += 1;

        continue;
      }

      counts.removed += 1;
      console.log(
        JSON.stringify({
          event: "revival_work_withdrawn",
          workId: verdict.row.id,
        }),
      );
      // oxlint-disable-next-line no-await-in-loop
      await deleteWork(env.DB, verdict.row.id);
    }
  }

  const progressed = counts.refreshed + counts.removed > 0;

  return { ...counts, exhausted: pending.length < limit || !progressed };
}

export async function matchRevivalWorks(env: Bindings, limit = MATCH_BATCH) {
  const deadline = Date.now() + MATCH_BUDGET_MS;
  const counts = { considered: 0, matched: 0 };
  let exhausted = false;

  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop
    const pending = await selectUnmatched(env.DB, limit);

    if (pending.length === 0) {
      exhausted = true;

      break;
    }

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

      counts.considered += 1;

      if (result.titleId) {
        counts.matched += 1;
      }
    }
  }

  return { ...counts, exhausted };
}

type ShelfPlan = {
  id: string;
  title: string;
  description: string;
  selector: ShelfSelector;
};

export function shelfSelector(id: string): ShelfSelector | null {
  if (id === "home") {
    return { of: "home" };
  }

  const divide = id.indexOf(":");
  const family = divide < 0 ? id : id.slice(0, divide);
  const value = divide < 0 ? "" : id.slice(divide + 1);

  if (family === "genre" || family === "subject" || family === "person") {
    return value ? { of: "tag", kind: family, slug: value } : null;
  }

  if (family === "country") {
    return value ? { of: "country", country: value } : null;
  }

  if (family === "decade") {
    const decade = Number(value);

    return Number.isInteger(decade) && decade > 1800 ? { of: "decade", decade } : null;
  }

  if (family === "runtime") {
    const band = RUNTIME_BANDS.findIndex((entry) => entry.id === value);

    return band < 0
      ? null
      : {
          of: "runtime",
          min: band === 0 ? 1 : RUNTIME_BANDS[band - 1].max,
          max: Number.isFinite(RUNTIME_BANDS[band].max) ? RUNTIME_BANDS[band].max : MAX_RUNTIME,
        };
  }

  if (family === "kind") {
    return value === "short" || value === "feature" || value === "ephemeral"
      ? { of: "kind", kind: value }
      : null;
  }

  return null;
}

async function planShelves(db: D1Database): Promise<ShelfPlan[]> {
  const [rawGenres, rawSubjects, people, countries, decades] = await Promise.all([
    readTagGroups(db, "genre", GENRE_SHELVES * 2, SHELF_MIN),
    readTagGroups(db, "subject", SUBJECT_SHELVES * 3, SHELF_MIN),
    readTagGroups(db, "person", PERSON_SHELVES, SHELF_MIN),
    readCountryGroups(db, COUNTRY_SHELVES, SHELF_MIN),
    readDecadeGroups(db, DECADE_SHELVES, SHELF_MIN),
  ]);
  const spoken = new Set<string>();
  const fresh = (groups: ShelfGroup[], limit: number) => {
    const kept: ShelfGroup[] = [];

    for (const group of groups) {
      if (kept.length >= limit) {
        break;
      }

      if (spoken.has(group.slug)) {
        continue;
      }

      spoken.add(group.slug);
      kept.push(group);
    }

    return kept;
  };

  const genres = fresh(rawGenres, GENRE_SHELVES);
  const subjects = fresh(rawSubjects, SUBJECT_SHELVES);

  return [
    {
      id: "home",
      title: "Made here",
      description: "British and Irish prints, out of copyright and back on a screen.",
      selector: { of: "home" },
    },
    ...genres.map((group) => ({
      id: `genre:${group.slug}`,
      title: group.label,
      description: `${group.size} of them, filed under ${group.label.toLowerCase()}.`,
      selector: {
        of: "tag" as const,
        kind: "genre" as const,
        slug: group.slug,
      },
    })),
    ...subjects.map((group) => ({
      id: `subject:${group.slug}`,
      title: group.label,
      description: "Everything we hold on the subject.",
      selector: {
        of: "tag" as const,
        kind: "subject" as const,
        slug: group.slug,
      },
    })),
    ...countries.map((group) => ({
      id: `country:${group.slug}`,
      title: `From ${group.label}`,
      description: `Held by archives in ${group.label} and released by them.`,
      selector: { of: "country" as const, country: group.slug },
    })),
    ...people.map((group) => ({
      id: `person:${group.slug}`,
      title: group.label,
      description: "Their work, as far as we hold it.",
      selector: {
        of: "tag" as const,
        kind: "person" as const,
        slug: group.slug,
      },
    })),
    ...RUNTIME_BANDS.slice(0, RUNTIME_SHELVES).map((band, index) => ({
      id: `runtime:${band.id}`,
      title: band.label,
      description: "Picked by how much of an evening it wants.",
      selector: {
        of: "runtime" as const,
        min: index === 0 ? 1 : RUNTIME_BANDS[index - 1].max,
        max: Number.isFinite(band.max) ? band.max : MAX_RUNTIME,
      },
    })),
    ...decades.map((group) => ({
      id: `decade:${group.slug}`,
      title: `The ${group.label}s`,
      description: `${group.size} from the decade.`,
      selector: { of: "decade" as const, decade: Number(group.slug) },
    })),
    {
      id: "kind:short",
      title: "Shorts and serials",
      description: "The bit before the main feature.",
      selector: { of: "kind", kind: "short" },
    },
    {
      id: "kind:ephemeral",
      title: "Ephemera",
      description: "Industrial films, adverts and instructional reels. Stranger than the features.",
      selector: { of: "kind", kind: "ephemeral" },
    },
  ];
}

async function readShelves(db: D1Database) {
  const plans = await planShelves(db);
  const filled = await Promise.all(
    plans.map(async (plan) => ({
      plan,
      works: await readShelfPage(db, plan.selector, RAIL_LENGTH),
    })),
  );

  return filled
    .filter((entry) => entry.works.length >= SHELF_MIN)
    .map((entry) => ({
      id: entry.plan.id,
      title: entry.plan.title,
      description: entry.plan.description,
      works: entry.works.map(toCard),
    }));
}

type BillSlot = {
  slot: string;
  note: string;
  selector: ShelfSelector;
  prefer?: (work: RevivalWork) => boolean;
};

const BILL: BillSlot[] = [
  {
    slot: "Feature presentation",
    note: "Tonight's main attraction.",
    selector: { of: "kind", kind: "feature" },
  },
  {
    slot: "Supporting feature",
    note: "The second half of the double bill.",
    selector: { of: "kind", kind: "feature" },
  },
  {
    slot: "Short before the feature",
    note: "Something to settle into your seat with.",
    selector: { of: "kind", kind: "short" },
  },
  {
    slot: "Late-night picture",
    note: "For after the lights have gone down twice.",
    selector: { of: "kind", kind: "feature" },
    prefer: lateNight,
  },
  {
    slot: "Curiosity",
    note: "Odds and ends from the vault.",
    selector: { of: "kind", kind: "ephemeral" },
  },
  {
    slot: "Curiosity",
    note: "Odds and ends from the vault.",
    selector: { of: "kind", kind: "ephemeral" },
  },
  {
    slot: "Curiosity",
    note: "Odds and ends from the vault.",
    selector: { of: "kind", kind: "short" },
  },
];

export async function drawBill(db: D1Database, day: string) {
  const next = shuffler(seedFrom(day));
  const taken = new Set<string>();
  const sizes = new Map<string, number>();
  const drawn: { slot: string; note: string; work: RevivalWork }[] = [];

  for (const entry of BILL) {
    const key = JSON.stringify(entry.selector);

    if (!sizes.has(key)) {
      // oxlint-disable-next-line no-await-in-loop
      sizes.set(key, await countShelf(db, entry.selector));
    }

    const total = sizes.get(key) ?? 0;

    if (total === 0) {
      continue;
    }

    let chosen: RevivalWork | null = null;

    for (let attempt = 0; attempt <= DRAW_ATTEMPTS && !chosen; attempt += 1) {
      const loose = attempt === DRAW_ATTEMPTS;
      // oxlint-disable-next-line no-await-in-loop
      const batch = await readShelfPage(
        db,
        entry.selector,
        DRAW_BATCH,
        standingOffset(total, next()),
      );

      chosen =
        batch.find(
          (work) =>
            !taken.has(work.id) &&
            !work.contentNotice &&
            (loose || !entry.prefer || entry.prefer(work)),
        ) ?? null;
    }

    if (chosen) {
      taken.add(chosen.id);
      drawn.push({ slot: entry.slot, note: entry.note, work: chosen });
    }
  }

  return drawn.map((entry) => ({ ...entry, work: toCard(entry.work) }));
}

export async function getProgramme(env: Bindings, viewerId: string | null) {
  const day = billDay();
  const [total, shelves, bill] = await Promise.all([
    countApproved(env.DB),
    readShelves(env.DB),
    drawBill(env.DB, day),
  ]);

  if (viewerId) {
    const progress = await readViewerProgress(env.DB, viewerId);
    const resuming = await readWorksByIds(
      env.DB,
      progress.map((entry) => entry.id),
    );

    if (resuming.length) {
      shelves.unshift({
        id: "resume",
        title: "Where you left off",
        description: "The lights are still down on these.",
        works: resuming.map(toCard),
      });
    }
  }

  return {
    bill,
    billDate: day,
    shelves,
    total,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getScreening(env: Bindings, id: string, viewerId: string | null) {
  const work = await readWork(env.DB, id);

  if (!work) {
    return null;
  }

  const [progress, alsoShowing, prints] = await Promise.all([
    viewerId
      ? readProgress(env.DB, viewerId, id)
      : Promise.resolve({ positionSeconds: 0, finished: false }),
    readAlsoShowing(env.DB, work.id, work.kind),
    work.groupId ? readGroupPrints(env.DB, work.groupId, work.id) : Promise.resolve([]),
  ]);

  return { work, ...progress, alsoShowing, prints: prints.map(toPrint) };
}
