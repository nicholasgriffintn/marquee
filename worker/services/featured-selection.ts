import type { MediaTitle, FeaturedSource } from "../../src/domain/catalog.ts";
import { MEAN_SCORE } from "../../src/domain/ratings.ts";
import { rankingHash } from "../../src/lib/string.ts";
import { clamp } from "../lib/numbers.ts";
import { computeWeightedRating } from "../lib/ratings.ts";

const DAY_MS = 86_400_000;
const MIN_GENERAL_RATING = 6.8;
const MIN_GENERAL_VOTES = 100;
const PERSONAL_SLATE_SIZE = 8;
const GENERAL_SLATE_LIMITS: Record<FeaturedSource, number> = {
  personal: 0,
  trending: 8,
  catalogue: 4,
};

export type FeaturedCandidate = {
  item: MediaTitle;
  source: FeaturedSource;
  position: number;
};

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function recommendablePool(candidates: FeaturedCandidate[]) {
  const personal = candidates.filter((candidate) => candidate.source === "personal");

  if (personal.length > 0) {
    return personal;
  }

  const recommendable = candidates.filter(
    (candidate) =>
      candidate.item.tmdbVoteCount >= MIN_GENERAL_VOTES &&
      computeWeightedRating(candidate.item) >= MIN_GENERAL_RATING,
  );

  return recommendable.length > 0 ? recommendable : candidates;
}

function candidateWeight(candidate: FeaturedCandidate) {
  const rating = computeWeightedRating(candidate.item);
  const quality = rating ? clamp(0.5 + (rating - MEAN_SCORE) / 2, 0.35, 1.75) : 0.35;
  const position = 1 / (1 + candidate.position * 0.15);

  return quality * position;
}

function rankedCandidates(candidates: FeaturedCandidate[]) {
  return candidates.toSorted(
    (left, right) =>
      candidateWeight(right) - candidateWeight(left) || left.item.id.localeCompare(right.item.id),
  );
}

function featuredSlate(candidates: FeaturedCandidate[], identity: string) {
  if (candidates.every((candidate) => candidate.source === "personal")) {
    return rankedCandidates(candidates)
      .slice(0, PERSONAL_SLATE_SIZE)
      .toSorted((left, right) => {
        const leftRank = rankingHash(`${identity}:featured-cycle:${left.item.id}`);
        const rightRank = rankingHash(`${identity}:featured-cycle:${right.item.id}`);

        return leftRank - rightRank || left.item.id.localeCompare(right.item.id);
      });
  }

  const limits = GENERAL_SLATE_LIMITS;
  const slateSize = Object.values(limits).reduce((total, limit) => total + limit, 0);
  const selected = (Object.entries(limits) as [FeaturedSource, number][]).flatMap(
    ([source, limit]) =>
      rankedCandidates(candidates.filter((candidate) => candidate.source === source)).slice(
        0,
        limit,
      ),
  );

  const selectedIds = new Set(selected.map((candidate) => candidate.item.id));
  const filled = [
    ...selected,
    ...rankedCandidates(candidates).filter((candidate) => !selectedIds.has(candidate.item.id)),
  ].slice(0, slateSize);

  return filled.toSorted((left, right) => {
    const leftRank = rankingHash(`${identity}:featured-cycle:${left.item.id}`);
    const rightRank = rankingHash(`${identity}:featured-cycle:${right.item.id}`);

    return leftRank - rightRank || left.item.id.localeCompare(right.item.id);
  });
}

function rotatedTitle(candidates: FeaturedCandidate[], identity: string, day: string) {
  const rotation = featuredSlate(candidates, identity);

  if (rotation.length === 0) {
    return null;
  }

  const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

  return rotation[dayNumber % rotation.length] ?? null;
}

export function chooseFeatured(candidates: FeaturedCandidate[], identity: string, now: Date) {
  const eligible = recommendablePool(candidates);
  const today = dayKey(now);

  return rotatedTitle(eligible, identity, today);
}
