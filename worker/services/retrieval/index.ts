import { logError, logEvent } from "../../lib/logging.ts";
import { clamp } from "../../lib/numbers.ts";
import {
  filterEligibleIds,
  readRanked,
  searchCatalogue,
  type CatalogueSearch,
} from "../../repositories/catalog-search.ts";
import type { Bindings } from "../../types.ts";
import { buzzBoosts } from "../buzz.ts";
import { embedQuery, nearestTo, neighboursOf, type Neighbour } from "../embeddings.ts";
import { fuseTitles, rankCandidates, titlesById } from "./candidates.ts";
import { rerankTitles } from "./rerank.ts";
import type { BoostSet, Candidate, RetrievalQuery, ScoredSource } from "./types.ts";
import { BOOST_WEIGHTS, POOL } from "./weights.ts";

export { explainCandidate, rankTitles } from "./candidates.ts";
export type { BoostSet, Candidate, RetrievalQuery, RetrievalSource, TitleSource } from "./types.ts";

const MAX_LIMIT = 40;
const SIMILAR_TOP_K = 60;

export function eligibilityOf(query: RetrievalQuery): CatalogueSearch {
  return {
    mediaType: query.mediaType,
    genres: query.genres,
    keywords: query.keywords,
    places: query.places,
    providerIds: query.providerIds,
    allowUnknownProviders: query.allowUnknownProviders,
    minScore: query.minScore,
    minVotes: query.minVotes,
    maxRuntime: query.maxRuntime,
    releasedAfter: query.releasedAfter,
    excludeIds: query.excludeIds,
  };
}

export function poolFor(limit: number) {
  return Math.min(POOL.semantic, limit * POOL.candidateFactor);
}

async function eligibleNeighbours(
  env: Bindings,
  matches: Neighbour[],
  query: RetrievalQuery,
  limit: number,
) {
  const eligible = await filterEligibleIds(
    env.DB,
    matches.map((match) => match.id),
    eligibilityOf(query),
  );

  return matches.filter((match) => eligible.has(match.id)).slice(0, limit);
}

export async function eligibleTitles(
  env: Bindings,
  ids: string[],
  query: RetrievalQuery,
  limit = POOL.semantic,
) {
  const ordered = await eligibleNeighbours(
    env,
    ids.map((id) => ({ id, score: 0 })),
    query,
    limit,
  );

  return ordered.length
    ? readRanked(
        env.DB,
        ordered.map((entry) => entry.id),
      )
    : [];
}

async function boostsFor(env: Bindings, ids: string[], query: RetrievalQuery) {
  const buzz = await buzzBoosts(env, ids).catch((error: unknown) => {
    logError("buzz_boosts_failed", error);

    return new Map<string, number>();
  });

  return [
    { name: "buzz", weight: BOOST_WEIGHTS.buzz, values: buzz },
    { name: "viewer", weight: BOOST_WEIGHTS.viewer, values: query.boosts ?? new Map() },
  ].filter((set): set is BoostSet => set.values.size > 0);
}

async function lexicalTitles(env: Bindings, query: RetrievalQuery, text: string) {
  const search: CatalogueSearch = {
    ...eligibilityOf(query),
    query: query.query ?? text,
    scope: query.scope,
    sort: query.sort,
    limit: POOL.lexical,
  };
  const titles = await searchCatalogue(env.DB, search);

  return titles.length ? titles : searchCatalogue(env.DB, { ...search, matchAny: true });
}

async function semanticIds(
  env: Bindings,
  query: RetrievalQuery,
  text: string,
): Promise<ScoredSource | null> {
  const vector = await embedQuery(env, text);

  if (!vector) {
    return null;
  }

  const matches = await nearestTo(env, vector, POOL.vectorTopK);
  const best = matches.reduce((top, match) => Math.max(top, match.score), 0);

  if (best < POOL.vectorMinScore) {
    return null;
  }

  const ordered = await eligibleNeighbours(env, matches, query, POOL.semantic);

  return {
    source: "semantic",
    ids: ordered.map((match) => match.id),
    scores: new Map(ordered.map((match) => [match.id, match.score])),
  };
}

async function browseCandidates(env: Bindings, query: RetrievalQuery, limit: number) {
  const titles = await searchCatalogue(env.DB, {
    ...query,
    limit: Math.max(limit, Math.min(limit * 2, POOL.lexical)),
  });
  const pool = titlesById([{ source: "popularity", titles }]);

  return rankCandidates({
    sources: [{ source: "popularity", ids: titles.map((title) => title.id) }],
    titles: pool,
    limit,
    boosts: await boostsFor(env, [...pool.keys()], query),
  });
}

export async function retrieveCandidates(
  env: Bindings,
  query: RetrievalQuery,
): Promise<Candidate[]> {
  const limit = clamp(query.limit ?? 12, 1, MAX_LIMIT);
  const text = query.text?.trim() || query.query?.trim() || "";

  if (!text) {
    return browseCandidates(env, query, limit);
  }

  const [lexicalResult, semanticResult] = await Promise.allSettled([
    lexicalTitles(env, query, text),
    semanticIds(env, query, text),
  ]);

  if (lexicalResult.status === "rejected") {
    logError("keyword_retrieval_failed", lexicalResult.reason);
  }

  if (semanticResult.status === "rejected") {
    logError("vector_retrieval_failed", semanticResult.reason);
  }

  const lexical = lexicalResult.status === "fulfilled" ? lexicalResult.value : [];
  const semantic = semanticResult.status === "fulfilled" ? semanticResult.value : null;
  const pool = titlesById([{ source: "lexical", titles: lexical }]);
  const unhydrated = (semantic?.ids ?? [])
    .filter((id) => !pool.has(id))
    .slice(0, Math.max(0, POOL.maximum - pool.size));

  for (const title of unhydrated.length ? await readRanked(env.DB, unhydrated) : []) {
    pool.set(title.id, title);
  }

  const sources: ScoredSource[] = [
    { source: "lexical", ids: lexical.map((title) => title.id) },
    ...(semantic ? [semantic] : []),
  ];
  const shortlist = fuseTitles(sources, pool).slice(0, POOL.rerank);
  const reranked =
    shortlist.length > limit
      ? await rerankTitles(env, text, shortlist)
      : { ids: [], scores: new Map<string, number>() };

  if (reranked.ids.length) {
    sources.push({ source: "rerank", ids: reranked.ids, scores: reranked.scores });
  }

  const ranked = rankCandidates({
    sources,
    titles: pool,
    limit,
    boosts: await boostsFor(env, [...pool.keys()], query),
  });

  logEvent("retrieval_ranked", {
    lexical: lexical.length,
    semantic: semantic?.ids.length ?? 0,
    pool: pool.size,
    reranked: reranked.ids.length,
    returned: ranked.length,
  });

  return ranked;
}

export async function retrieveTitles(env: Bindings, query: RetrievalQuery) {
  const candidates = await retrieveCandidates(env, query);

  return candidates.map((candidate) => candidate.title);
}

export async function retrieveSimilar(
  env: Bindings,
  titleId: string,
  query: RetrievalQuery = {},
): Promise<Candidate[]> {
  const limit = clamp(query.limit ?? 12, 1, MAX_LIMIT);
  const neighbours = await neighboursOf(env, titleId, SIMILAR_TOP_K);

  if (neighbours.length === 0) {
    return [];
  }

  const ordered = await eligibleNeighbours(
    env,
    neighbours,
    { ...query, excludeIds: [...(query.excludeIds ?? []), titleId] },
    poolFor(limit),
  );

  if (ordered.length === 0) {
    return [];
  }

  const ids = ordered.map((neighbour) => neighbour.id);
  const pool = titlesById([{ source: "similar", titles: await readRanked(env.DB, ids) }]);

  return rankCandidates({
    sources: [
      {
        source: "similar",
        ids,
        scores: new Map(ordered.map((neighbour) => [neighbour.id, neighbour.score])),
      },
    ],
    titles: pool,
    limit,
    boosts: await boostsFor(env, [...pool.keys()], query),
  });
}
