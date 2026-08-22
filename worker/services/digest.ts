import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { readRanked } from "../repositories/catalog-search.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { prepareRails } from "./ai-rails.ts";
import { readTrending } from "./buzz.ts";
import { readTonight } from "./schedule.ts";

const FRESH_PICKS = 6;
const NEIGHBOUR_TOP_K = 120;

export type Digest = {
  createdAt: string;
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
     WHERE id IN (${ids.map(() => "?").join(", ")})
       AND COALESCE(year, 0) >= ?
     ORDER BY popularity DESC
     LIMIT ?`,
  )
    .bind(...ids, new Date().getUTCFullYear() - 1, FRESH_PICKS)
    .all<{ id: string }>();

  return rows.results.map((row) => row.id);
}

export async function buildDigest(env: Bindings, viewerId: string) {
  const viewer = await readViewerContext(env.DB, viewerId);

  if (viewer.entries.length === 0) {
    return null;
  }

  const { vector, exclude } = await prepareRails(env, viewer);
  const [fresh, trending, episodes] = await Promise.all([
    freshForViewer(env, vector, [
      ...exclude,
      ...viewer.entries.map((entry) => entry.titleId),
    ]).catch((error: unknown): string[] => {
      logError("digest_fresh_failed", error, { viewerId });

      return [];
    }),
    readTrending(env, 6),
    readTonight(env, viewerId, 168),
  ]);
  const digest: Digest = {
    createdAt: new Date().toISOString(),
    fresh,
    trending,
    episodes: episodes.slice(0, 12).map((episode) => ({
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
  const items = await readRanked(env.DB, [...digest.fresh, ...digest.trending]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const pick = (ids: string[]): MediaTitle[] =>
    ids.flatMap((id) => {
      const item = byId.get(id);

      return item ? [item] : [];
    });

  return {
    createdAt: digest.createdAt,
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
