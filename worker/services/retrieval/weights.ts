import type { RetrievalSource } from "./types.ts";

export const SOURCE_WEIGHTS: Record<RetrievalSource, number> = {
  rerank: 3,
  lexical: 2,
  semantic: 1.6,
  similar: 1.6,
  keyword: 1,
  genre: 0.8,
  popularity: 0.5,
};

export const BOOST_WEIGHTS = { buzz: 0.2, viewer: 0.3 };

export const DIVERSITY = { share: 1 / 3, minimumCap: 2, penalty: 0.85 };

export const POOL = {
  candidateFactor: 3,
  lexical: 30,
  semantic: 60,
  rerank: 48,
  maximum: 96,
  vectorMinScore: 0.4,
};
