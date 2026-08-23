import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { readRanked } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";
import { prepareRails, readRailViewer } from "./ai-rails.ts";
import { readTrending } from "./buzz.ts";
import { readTonight } from "./schedule.ts";
import { pickOne } from "./usher-pick.ts";

const FRESH_PICKS = 12;
const DIGEST_TRENDING = 12;
const DIGEST_EPISODES = 16;
const NEIGHBOUR_TOP_K = 100;

export type DigestNumbers = {
  added: number;
  finished: number;
  shelved: number;
  catalogue: number;
};

export type Digest = {
  createdAt: string;
  lead: { titleId: string; line: string } | null;
  numbers: DigestNumbers;
  fresh: string[];
  trending: string[];
  episodes: {
    titleId: string | null;
    showName: string;
    season: number | null;
    episode: number | null;
    airsAt: string;
  }[];
};

async function weekNumbers(env: Bindings, viewerId: string): Promise<DigestNumbers> {
  const [shelf, catalogue] = await Promise.all([
    env.DB.prepare(
      `SELECT
         sum(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS added,
         sum(CASE WHEN status = 'watched'
                   AND updated_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS finished,
         count(*) AS shelved
       FROM viewing_entries WHERE viewer_id = ?`,
    )
      .bind(viewerId)
      .first<{ added: number; finished: number; shelved: number }>(),
    env.DB.prepare(`SELECT count(*) AS catalogue FROM catalog_titles`).first<{
      catalogue: number;
    }>(),
  ]);

  return {
    added: shelf?.added ?? 0,
    finished: shelf?.finished ?? 0,
    shelved: shelf?.shelved ?? 0,
    catalogue: catalogue?.catalogue ?? 0,
  };
}

async function leadForViewer(env: Bindings, viewerId: string, providerIds: string[]) {
  try {
    const pick = await pickOne(env, viewerId, { providerIds, hour: 20 });

    return pick ? { titleId: pick.item.id, line: pick.line } : null;
  } catch (error) {
    logError("digest_lead_failed", error, { viewerId });

    return null;
  }
}

async function freshForViewer(env: Bindings, vector: number[] | null, exclude: string[]) {
  if (!vector) {
    return [];
  }

  const matches = await env.VECTORS.query(vector, {
    topK: NEIGHBOUR_TOP_K,
    returnMetadata: "none",
  });
  const excluded = new Set(exclude);
  const ids = matches.matches.map((match) => match.id).filter((id) => !excluded.has(id));

  if (ids.length === 0) {
    return [];
  }

  const rows = await env.DB.prepare(
    `SELECT id
     FROM catalog_titles
     WHERE id IN (SELECT value FROM json_each(?))
       AND COALESCE(year, 0) >= ?
     ORDER BY popularity DESC
     LIMIT ?`,
  )
    .bind(JSON.stringify(ids), new Date().getUTCFullYear() - 1, FRESH_PICKS)
    .all<{ id: string }>();

  return rows.results.map((row) => row.id);
}

export async function buildDigest(env: Bindings, viewerId: string) {
  const { viewer, preferences } = await readRailViewer(env, viewerId);

  if (viewer.entries.length === 0) {
    return null;
  }

  const { vector, exclude } = await prepareRails(env, viewer, viewerId, preferences);
  const [fresh, trending, episodes, numbers, lead] = await Promise.all([
    freshForViewer(env, vector, [
      ...exclude,
      ...viewer.entries.map((entry) => entry.titleId),
    ]).catch((error: unknown): string[] => {
      logError("digest_fresh_failed", error, { viewerId });

      return [];
    }),
    readTrending(env, DIGEST_TRENDING),
    readTonight(env, viewerId, DIGEST_EPISODES, 168),
    weekNumbers(env, viewerId),
    leadForViewer(env, viewerId, preferences.providerIds),
  ]);
  const digest: Digest = {
    createdAt: new Date().toISOString(),
    lead,
    numbers,
    fresh,
    trending,
    episodes: episodes.map((episode) => ({
      titleId: episode.titleId,
      showName: episode.showName,
      season: episode.season,
      episode: episode.episode,
      airsAt: episode.airsAt,
    })),
  };

  if (digest.fresh.length === 0 && digest.episodes.length === 0) {
    return null;
  }

  await env.DB.prepare(
    `INSERT INTO viewer_digests (viewer_id, payload)
     VALUES (?, ?)
     ON CONFLICT(viewer_id) DO UPDATE SET
       payload = excluded.payload,
       created_at = CURRENT_TIMESTAMP`,
  )
    .bind(viewerId, JSON.stringify(digest))
    .run();

  console.log(
    JSON.stringify({
      event: "digest_built",
      fresh: fresh.length,
      episodes: digest.episodes.length,
    }),
  );

  return digest;
}

export async function readDigest(env: Bindings, viewerId: string) {
  const row = await env.DB.prepare(`SELECT payload FROM viewer_digests WHERE viewer_id = ?`)
    .bind(viewerId)
    .first<{ payload: string }>();

  if (!row) {
    return null;
  }

  const digest = JSON.parse(row.payload) as Digest;
  const items = await readRanked(env.DB, [
    ...(digest.lead ? [digest.lead.titleId] : []),
    ...digest.fresh,
    ...digest.trending,
  ]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const pick = (ids: string[]): MediaTitle[] =>
    ids.flatMap((id) => {
      const item = byId.get(id);

      return item ? [item] : [];
    });

  return {
    createdAt: digest.createdAt,
    lead: digest.lead
      ? { item: byId.get(digest.lead.titleId) ?? null, line: digest.lead.line }
      : null,
    numbers: digest.numbers ?? { added: 0, finished: 0, shelved: 0, catalogue: 0 },
    fresh: pick(digest.fresh),
    trending: pick(digest.trending),
    episodes: digest.episodes,
  };
}

export async function viewersWithShelves(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT viewer_id AS viewerId FROM viewing_entries LIMIT 200`,
  ).all<{ viewerId: string }>();

  return rows.results.map((row) => row.viewerId);
}
