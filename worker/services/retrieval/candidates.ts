import type { MediaTitle } from "../../../src/domain/catalog.ts";
import { fuseRankedLists, selectDiverse, unitScale, type RankedList } from "../../lib/ranking.ts";
import type { BoostSet, Candidate, CandidateBoost, ScoredSource, TitleSource } from "./types.ts";
import { DIVERSITY, SOURCE_WEIGHTS } from "./weights.ts";

export function groupsFor(title: MediaTitle) {
  const collection = title.collection ? [`collection:${title.collection.id}`] : [];
  const genre = title.genres[0] ? [`genre:${title.genres[0].toLowerCase()}`] : [];

  return [...collection, ...genre];
}

export function titlesById(sources: TitleSource[]) {
  return new Map(sources.flatMap((source) => source.titles).map((title) => [title.id, title]));
}

function rankedLists(sources: ScoredSource[], titles: Map<string, MediaTitle>): RankedList[] {
  return sources.map((source) => ({
    source: source.source,
    weight: SOURCE_WEIGHTS[source.source],
    ids: source.ids.filter((id) => titles.has(id)),
    scores: source.scores,
  }));
}

function diversityCap(limit: number) {
  return Math.max(DIVERSITY.minimumCap, Math.ceil(limit * DIVERSITY.share));
}

export function fuseTitles(sources: ScoredSource[], titles: Map<string, MediaTitle>) {
  return fuseRankedLists(rankedLists(sources, titles)).flatMap((entry): MediaTitle[] => {
    const title = titles.get(entry.id);

    return title ? [title] : [];
  });
}

export function rankCandidates(options: {
  sources: ScoredSource[];
  titles: Map<string, MediaTitle>;
  limit: number;
  boosts?: BoostSet[];
}): Candidate[] {
  const fused = fuseRankedLists(rankedLists(options.sources, options.titles));
  const relevance = unitScale(fused.map((entry) => entry.score));
  const boostSets = (options.boosts ?? []).map((set) => ({
    name: set.name,
    weight: set.weight,
    values: set.values,
    scale: unitScale(fused.map((entry) => set.values.get(entry.id) ?? 0)),
  }));
  const scored = fused.flatMap((entry): Candidate[] => {
    const title = options.titles.get(entry.id);

    if (!title) {
      return [];
    }

    const boosts = boostSets.flatMap((set): CandidateBoost[] => {
      const value = set.values.get(entry.id) ?? 0;

      return value > 0
        ? [{ name: set.name, value: set.scale(value) * set.weight, weight: set.weight }]
        : [];
    });
    const base = relevance(entry.score);

    return [
      {
        title,
        score: boosts.reduce((total, boost) => total + boost.value, base),
        relevance: base,
        evidence: entry.contributions,
        boosts,
        diversity: 1,
      },
    ];
  });
  const ordered = scored.toSorted(
    (left, right) => right.score - left.score || left.title.id.localeCompare(right.title.id),
  );

  return selectDiverse(ordered, {
    limit: options.limit,
    cap: diversityCap(options.limit),
    penalty: DIVERSITY.penalty,
    score: (candidate) => candidate.score,
    groups: (candidate) => groupsFor(candidate.title),
  }).map((choice): Candidate => ({
    title: choice.item.title,
    score: choice.score,
    relevance: choice.item.relevance,
    evidence: choice.item.evidence,
    boosts: choice.item.boosts,
    diversity: choice.penalty,
  }));
}

export function rankTitles(
  sources: TitleSource[],
  options: { limit: number; boosts?: BoostSet[] },
): Candidate[] {
  return rankCandidates({
    sources: sources.map((source) => ({
      source: source.source,
      ids: source.titles.map((title) => title.id),
    })),
    titles: titlesById(sources),
    limit: options.limit,
    boosts: options.boosts,
  });
}

export function explainCandidate(candidate: Candidate) {
  const evidence = candidate.evidence.map((entry) => `${entry.source} #${entry.rank + 1}`);
  const boosts = candidate.boosts.map((boost) => `${boost.name} +${boost.value.toFixed(2)}`);

  return [...evidence, ...boosts].join(", ");
}
