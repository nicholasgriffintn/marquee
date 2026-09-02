import type { MediaTitle } from "../../../src/domain/catalog.ts";
import { logError, logEvent } from "../../lib/logging.ts";
import { clamp } from "../../lib/numbers.ts";
import { searchCatalogue, type CatalogueSearch } from "../../repositories/catalog-search.ts";
import type { Bindings } from "../../types.ts";
import { buzzBoosts } from "../buzz.ts";
import { embedQuery, nearestMatches, neighboursOf, type Neighbour } from "../embeddings.ts";
import { WIDE_TOP_K } from "../vector-index.ts";
import { fuseTitles, rankCandidates, titlesById } from "./candidates.ts";
import { rerankTitles, type Ranking } from "./rerank.ts";
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
    availability: query.availability,
    certifications: query.certifications,
    minScore: query.minScore,
    minVotes: query.minVotes,
    maxRuntime: query.maxRuntime,
    releasedAfter: query.releasedAfter,
    excludeIds: query.excludeIds,
    excludeGenres: query.excludeGenres,
    languages: query.languages,
  };
}

export function poolFor(limit: number) {
  return Math.min(POOL.semantic, limit * POOL.candidateFactor);
}

export async function eligibleTitles(
  env: Bindings,
  ids: string[],
  query: RetrievalQuery,
  limit = POOL.semantic,
) {
  if (ids.length === 0) {
    return [];
  }

  return searchCatalogue(env.DB, {
    ...eligibilityOf(query),
    includeIds: ids,
    sort: query.sort ?? "given",
    limit,
  });
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

type SemanticResult = { titles: MediaTitle[]; scores: Map<string, number>; filtered: boolean };

function mergeNeighbours(primary: Neighbour[], extra: Neighbour[]) {
  const seen = new Set(primary.map((neighbour) => neighbour.id));

  return [...primary, ...extra.filter((neighbour) => !seen.has(neighbour.id))];
}

async function semanticTitles(
  env: Bindings,
  query: RetrievalQuery,
  text: string,
  limit: number,
): Promise<SemanticResult | null> {
  const vector = await embedQuery(env, text);

  if (!vector) {
    return null;
  }

  const search = eligibilityOf(query);
  const first = await nearestMatches(env, vector, search);
  const best = first.neighbours.reduce((top, match) => Math.max(top, match.score), 0);

  if (best < POOL.vectorMinScore) {
    return null;
  }

  const pooled = { ...query, sort: "given" as const };
  let matches = first.neighbours;
  let titles = await eligibleTitles(
    env,
    matches.map((match) => match.id),
    pooled,
    POOL.semantic,
  );

  if (titles.length < limit) {
    const wide = await nearestMatches(env, vector, search, {
      topK: WIDE_TOP_K,
      skipFilter: true,
    });
    const merged = mergeNeighbours(matches, wide.neighbours);

    if (merged.length > matches.length) {
      matches = merged;
      titles = await eligibleTitles(
        env,
        matches.map((match) => match.id),
        pooled,
        POOL.semantic,
      );
    }
  }

  return {
    titles,
    scores: new Map(matches.map((match) => [match.id, match.score])),
    filtered: first.filtered,
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
    semanticTitles(env, query, text, limit),
  ]);

  if (lexicalResult.status === "rejected") {
    logError("keyword_retrieval_failed", lexicalResult.reason);
  }

  if (semanticResult.status === "rejected") {
    logError("vector_retrieval_failed", semanticResult.reason);
  }

  const lexical = lexicalResult.status === "fulfilled" ? lexicalResult.value : [];
  const semantic = semanticResult.status === "fulfilled" ? semanticResult.value : null;
  const pool = titlesById([
    { source: "lexical", titles: lexical },
    ...(semantic ? [{ source: "semantic" as const, titles: semantic.titles }] : []),
  ]);
  const sources: ScoredSource[] = [
    { source: "lexical", ids: lexical.map((title) => title.id) },
    ...(semantic
      ? [
          {
            source: "semantic" as const,
            ids: semantic.titles.map((title) => title.id),
            scores: semantic.scores,
          },
        ]
      : []),
  ];
  const shortlist = fuseTitles(sources, pool).slice(0, POOL.rerank);
  const unranked: Ranking = { ids: [], scores: new Map() };
  const [reranked, boosts] = await Promise.all([
    shortlist.length > limit ? rerankTitles(env, text, shortlist) : Promise.resolve(unranked),
    boostsFor(env, [...pool.keys()], query),
  ]);

  if (reranked.ids.length) {
    sources.push({ source: "rerank", ids: reranked.ids, scores: reranked.scores });
  }

  const ranked = rankCandidates({ sources, titles: pool, limit, boosts });

  logEvent("retrieval_ranked", {
    lexical: lexical.length,
    semantic: semantic?.titles.length ?? 0,
    filtered: semantic?.filtered ?? false,
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
  let neighbours = await neighboursOf(env, titleId, SIMILAR_TOP_K);

  if (neighbours.length === 0) {
    return [];
  }

  const pooled: RetrievalQuery = {
    ...query,
    sort: "given",
    excludeIds: [...(query.excludeIds ?? []), titleId],
  };
  let titles = await eligibleTitles(
    env,
    neighbours.map((neighbour) => neighbour.id),
    pooled,
    poolFor(limit),
  );

  if (titles.length < limit) {
    const merged = mergeNeighbours(neighbours, await neighboursOf(env, titleId, WIDE_TOP_K));

    if (merged.length > neighbours.length) {
      neighbours = merged;
      titles = await eligibleTitles(
        env,
        neighbours.map((neighbour) => neighbour.id),
        pooled,
        poolFor(limit),
      );
    }
  }

  if (titles.length === 0) {
    return [];
  }

  const pool = titlesById([{ source: "similar", titles }]);

  return rankCandidates({
    sources: [
      {
        source: "similar",
        ids: titles.map((title) => title.id),
        scores: new Map(neighbours.map((neighbour) => [neighbour.id, neighbour.score])),
      },
    ],
    titles: pool,
    limit,
    boosts: await boostsFor(env, [...pool.keys()], query),
  });
}
