import { NO_ACCESS } from "../../src/domain/access.ts";
import type { MediaTitle } from "../../src/domain/catalog.ts";
import {
  currentWeekOf,
  isWeekOf,
  shiftDays,
  type EditionIssue,
  type EditionNumbers,
} from "../../src/domain/edition.ts";
import { INDEXABLE_POPULARITY } from "../../src/domain/visibility.ts";
import { listKvKeys, readKvValue, writeKvValue } from "../lib/cache.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { countApproved } from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";
import { readTrending } from "./buzz.ts";

const KEY_PREFIX = "edition:";
const KEEP_SECONDS = 350 * 86_400;
const READ_SECONDS = 600;
const ARRIVAL_ROWS = 400;
const PROVIDERS = 10;
const PER_PROVIDER = 8;
const RETURNING = 16;
const TRENDING = 12;

type StoredEdition = {
  weekOf: string;
  printedAt: string;
  numbers: EditionNumbers;
  arrivals: { providerId: string; name: string; titleIds: string[] }[];
  returning: { titleId: string; showName: string; season: number | null; airsAt: string }[];
  trending: string[];
};

type ArrivalRow = { providerId: string; name: string; titleId: string };

type ReturningRow = { titleId: string; showName: string; season: number | null; airsAt: string };

async function readArrivals(env: Bindings, from: string, to: string) {
  const { rows } = await env.DB.query<ArrivalRow>(
    `SELECT s.provider_id AS "providerId", p.name, s.title_id AS "titleId"
       FROM title_provider_state AS s
       JOIN catalog_titles AS t ON t.id = s.title_id
       JOIN catalog_title_providers AS p
         ON p.title_id = s.title_id AND p.provider_id = s.provider_id
      WHERE s.offer_kind = 'streaming'
        AND s.provider_id NOT LIKE '%:%'
        AND s.first_seen_at >= $1 AND s.first_seen_at < $2
        AND t.popularity >= $3
      ORDER BY t.popularity DESC, s.first_seen_at DESC
      LIMIT $4`,
    [from, to, INDEXABLE_POPULARITY, ARRIVAL_ROWS],
  );
  const byProvider = new Map<string, { name: string; titleIds: string[] }>();

  for (const row of rows) {
    const entry = byProvider.get(row.providerId) ?? { name: row.name, titleIds: [] };

    if (entry.titleIds.length < PER_PROVIDER) {
      entry.titleIds.push(row.titleId);
    }

    byProvider.set(row.providerId, entry);
  }

  return {
    total: rows.length,
    arrivals: [...byProvider.entries()]
      .toSorted((a, b) => b[1].titleIds.length - a[1].titleIds.length)
      .slice(0, PROVIDERS)
      .map(([providerId, entry]) => ({ providerId, name: entry.name, titleIds: entry.titleIds })),
  };
}

async function readReturning(env: Bindings, from: string, to: string) {
  const { rows } = await env.DB.query<ReturningRow>(
    `SELECT s.title_id AS "titleId", s.show_name AS "showName", s.season, s.airs_at AS "airsAt"
       FROM title_schedule AS s
       JOIN catalog_titles AS t ON t.id = s.title_id
      WHERE s.episode = 1 AND s.airs_at >= $1 AND s.airs_at < $2
      ORDER BY t.popularity DESC, s.airs_at
      LIMIT $3`,
    [from, to, RETURNING * 3],
  );
  const seen = new Set<string>();

  return rows
    .filter((row) => (seen.has(row.titleId) ? false : seen.add(row.titleId)))
    .slice(0, RETURNING);
}

async function buildEdition(env: Bindings, weekOf: string): Promise<StoredEdition> {
  const arrivalsFrom = `${shiftDays(weekOf, -7)}T00:00:00Z`;
  const weekStart = `${weekOf}T00:00:00Z`;
  const weekEnd = `${shiftDays(weekOf, 7)}T00:00:00Z`;
  const [arrivals, returning, trending, catalogue, prints] = await Promise.all([
    readArrivals(env, arrivalsFrom, weekEnd),
    readReturning(env, weekStart, weekEnd),
    readTrending(env, TRENDING),
    env.DB.first<{ total: number }>("SELECT COUNT(*) AS total FROM catalog_titles"),
    countApproved(env.DB),
  ]);

  return {
    weekOf,
    printedAt: new Date().toISOString(),
    numbers: { arrivals: arrivals.total, catalogue: catalogue?.total ?? 0, prints },
    arrivals: arrivals.arrivals,
    returning,
    trending,
  };
}

async function storedFor(env: Bindings, weekOf: string) {
  const key = `${KEY_PREFIX}${weekOf}`;
  const stored = await readKvValue<StoredEdition>(env, key, READ_SECONDS);

  // An issue is printed once and then kept, so a past week that is not on file stays missing.
  if (stored || weekOf !== currentWeekOf()) {
    return stored;
  }

  const built = await buildEdition(env, weekOf);

  await writeKvValue(env, key, built, KEEP_SECONDS);

  return built;
}

export async function listEditions(env: Bindings) {
  const keys = await listKvKeys(env, KEY_PREFIX);

  return keys.filter(isWeekOf).toSorted((a, b) => b.localeCompare(a));
}

export async function readEdition(env: Bindings, requested?: string): Promise<EditionIssue | null> {
  const weekOf = requested ?? currentWeekOf();

  if (!isWeekOf(weekOf) || weekOf > currentWeekOf()) {
    return null;
  }

  const stored = await storedFor(env, weekOf);

  if (!stored) {
    return null;
  }

  const ids = [
    ...stored.arrivals.flatMap((entry) => entry.titleIds),
    ...stored.returning.map((entry) => entry.titleId),
    ...stored.trending,
  ];
  const [items, issues] = await Promise.all([
    readItems(env.DB, ids, NO_ACCESS, 400),
    listEditions(env),
  ]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const pick = (id: string): MediaTitle | null => byId.get(id) ?? null;

  return {
    weekOf: stored.weekOf,
    printedAt: stored.printedAt,
    numbers: stored.numbers,
    arrivals: stored.arrivals
      .map((entry) => ({
        provider: { id: entry.providerId, name: entry.name },
        items: entry.titleIds.flatMap((id) => pick(id) ?? []),
      }))
      .filter((entry) => entry.items.length > 0),
    returning: stored.returning.map((entry) => ({
      item: pick(entry.titleId),
      showName: entry.showName,
      season: entry.season,
      airsAt: entry.airsAt,
    })),
    trending: stored.trending.flatMap((id) => pick(id) ?? []),
    issues,
  };
}
