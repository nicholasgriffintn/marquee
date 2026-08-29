import type { MediaTitle } from "../../../src/domain/catalog.ts";
import type { RankContribution } from "../../lib/ranking.ts";
import type { CatalogueSearch } from "../../repositories/catalog-search.ts";

export type RetrievalSource =
  | "lexical"
  | "semantic"
  | "similar"
  | "keyword"
  | "genre"
  | "popularity"
  | "rerank";

export type RetrievalQuery = CatalogueSearch & {
  text?: string;
  boosts?: Map<string, number>;
};

export type CandidateBoost = { name: string; value: number; weight: number };

export type Candidate = {
  title: MediaTitle;
  score: number;
  relevance: number;
  evidence: RankContribution[];
  boosts: CandidateBoost[];
  diversity: number;
};

export type ScoredSource = {
  source: RetrievalSource;
  ids: string[];
  scores?: Map<string, number>;
};

export type TitleSource = { source: RetrievalSource; titles: MediaTitle[] };

export type BoostSet = { name: string; weight: number; values: Map<string, number> };
