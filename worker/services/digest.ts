import type { MediaTitle } from "../../src/domain/catalog.ts";
import { candidatesFrom, type DecisionCandidate } from "../lib/decisions.ts";
import { mintJourney } from "../lib/journeys.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { readRanked } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";
import { prepareRails } from "./ai-rails.ts";
import { readTrending } from "./buzz.ts";
import { beginDecision } from "./decisions.ts";
import { nearestTo } from "./embeddings.ts";
import { eligibleTitles } from "./retrieval/index.ts";
import { readTonight } from "./schedule.ts";
import { pickOne } from "./usher-pick.ts";
import type { Eligibility } from "./viewer/eligibility.ts";
import { readViewerState } from "./viewer/state.ts";

const FRESH_PICKS = 12;
const DIGEST_TRENDING = 12;
const DIGEST_EPISODES = 16;

export type DigestNumbers = {
  added: number;
  finished: number;
  shelved: number;
  catalogue: number;
};

export type Digest = {
  createdAt: string;
  decisionId?: string;
  lead: { titleId: string; line: string; facts: string[]; decisionId?: string } | null;
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

    return pick
      ? {
          titleId: pick.item.id,
          line: pick.line,
          facts: pick.facts,
          decisionId: pick.decisionId,
        }
      : null;
  } catch (error) {
    logError("digest_lead_failed", error, { viewerId });

    return null;
  }
}

type FreshTitles = { titleIds: string[]; candidates: DecisionCandidate[] };

const NO_FRESH: FreshTitles = { titleIds: [], candidates: [] };

async function freshForViewer(
  env: Bindings,
  vector: number[] | null,
  eligibility: Eligibility,
): Promise<FreshTitles> {
  if (!vector) {
    return NO_FRESH;
  }

  const releasedAfter = new Date().getUTCFullYear() - 1;
  const matches = await nearestTo(env, vector, { ...eligibility, releasedAfter });

  if (matches.length === 0) {
    return NO_FRESH;
  }

  const titles = await eligibleTitles(
    env,
    matches.map((match) => match.id),
    { ...eligibility, releasedAfter, sort: "given" },
    FRESH_PICKS,
  );
  const scores = new Map(matches.map((match) => [match.id, match.score]));

  return {
    titleIds: titles.map((title) => title.id),
    candidates: candidatesFrom(titles, { scores, origin: "digest_vector" }),
  };
}

export async function buildDigest(env: Bindings, viewerId: string) {
  const viewer = await readViewerState(env, viewerId);

  if (viewer.entries.length === 0) {
    return null;
  }

  const decision = beginDecision(env, { feature: "digest", viewerId });
  const { vector, eligibility } = await prepareRails(env, viewer);
  const digestEligibility: Eligibility = {
    ...eligibility,
    excludeIds: [
      ...new Set([...eligibility.excludeIds, ...viewer.entries.map((entry) => entry.titleId)]),
    ],
  };
  const [fresh, trending, episodes, numbers, lead] = await Promise.all([
    freshForViewer(env, vector, digestEligibility).catch((error: unknown): FreshTitles => {
      logError("digest_fresh_failed", error, { viewerId });

      return NO_FRESH;
    }),
    readTrending(env, DIGEST_TRENDING),
    readTonight(env, viewerId, DIGEST_EPISODES, 168),
    weekNumbers(env, viewerId),
    leadForViewer(env, viewerId, viewer.providerIds),
  ]);

  decision.candidates([
    ...fresh.candidates,
    ...candidatesFrom(
      trending.map((id) => ({ id })),
      { origin: "digest_trending" },
    ),
  ]);
  decision.select([...fresh.titleIds, ...trending]);

  const digest: Digest = {
    createdAt: new Date().toISOString(),
    decisionId: decision.id,
    lead,
    numbers,
    fresh: fresh.titleIds,
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
    await decision.settle("empty");

    return null;
  }

  await decision.settle("served");

  await env.DB.prepare(
    `INSERT INTO viewer_digests (viewer_id, payload)
     VALUES (?, ?)
     ON CONFLICT(viewer_id) DO UPDATE SET
       payload = excluded.payload,
       created_at = CURRENT_TIMESTAMP`,
  )
    .bind(viewerId, JSON.stringify(digest))
    .run();

  logEvent("digest_built", {
    fresh: fresh.titleIds.length,
    episodes: digest.episodes.length,
  });

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
  const [freshJourney, trendingJourney, leadJourney] = await Promise.all([
    mintJourney(env, {
      mode: "digest",
      angle: "digest_fresh",
      size: digest.fresh.length,
      decisionId: digest.decisionId,
    }),
    mintJourney(env, {
      mode: "digest",
      angle: "digest_trending",
      size: digest.trending.length,
      decisionId: digest.decisionId,
    }),
    digest.lead
      ? mintJourney(env, {
          mode: "usher-pick",
          angle: "digest_lead",
          size: 1,
          decisionId: digest.lead.decisionId,
        })
      : Promise.resolve(null),
  ]);

  return {
    createdAt: digest.createdAt,
    freshJourney: freshJourney.token,
    trendingJourney: trendingJourney.token,
    lead: digest.lead
      ? {
          item: byId.get(digest.lead.titleId) ?? null,
          line: digest.lead.line,
          facts: digest.lead.facts ?? [],
          ...(leadJourney ? { journey: leadJourney.token } : {}),
        }
      : null,
    numbers: digest.numbers ?? { added: 0, finished: 0, shelved: 0, catalogue: 0 },
    fresh: pick(digest.fresh),
    trending: pick(digest.trending),
    episodes: digest.episodes,
  };
}

const VIEWER_PAGE = 500;

export async function viewersWithShelves(env: Bindings) {
  const viewers: string[] = [];

  for (let page = 0; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await env.DB.prepare(
      `SELECT DISTINCT viewer_id AS viewerId FROM viewing_entries
        ORDER BY viewer_id LIMIT ?1 OFFSET ?2`,
    )
      .bind(VIEWER_PAGE, page * VIEWER_PAGE)
      .all<{ viewerId: string }>();

    viewers.push(...rows.results.map((row) => row.viewerId));

    if (rows.results.length < VIEWER_PAGE || page > 40) {
      break;
    }
  }

  return viewers;
}
