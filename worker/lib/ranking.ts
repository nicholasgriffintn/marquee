export const RRF_DAMPING = 60;

export type RankedList = {
  source: string;
  weight: number;
  ids: string[];
  scores?: Map<string, number>;
};

export type RankContribution = {
  source: string;
  rank: number;
  weight: number;
  score: number | null;
  contribution: number;
};

export type FusedCandidate = {
  id: string;
  score: number;
  bestRank: number;
  contributions: RankContribution[];
};

export function reciprocalRank(rank: number, damping = RRF_DAMPING) {
  return 1 / (damping + rank + 1);
}

function byFusedScore(left: FusedCandidate, right: FusedCandidate) {
  return (
    right.score - left.score || left.bestRank - right.bestRank || left.id.localeCompare(right.id)
  );
}

export function fuseRankedLists(lists: RankedList[], damping = RRF_DAMPING): FusedCandidate[] {
  const fused = new Map<string, FusedCandidate>();

  for (const list of lists) {
    const ranked = [...new Set(list.ids)];

    for (const [rank, id] of ranked.entries()) {
      const contribution = list.weight * reciprocalRank(rank, damping);
      const entry = fused.get(id) ?? { id, score: 0, bestRank: rank, contributions: [] };

      entry.score += contribution;
      entry.bestRank = Math.min(entry.bestRank, rank);
      entry.contributions.push({
        source: list.source,
        rank,
        weight: list.weight,
        score: list.scores?.get(id) ?? null,
        contribution,
      });
      fused.set(id, entry);
    }
  }

  return [...fused.values()].toSorted(byFusedScore);
}

export function unitScale(values: number[]) {
  const lowest = values.reduce((low, value) => Math.min(low, value), Number.POSITIVE_INFINITY);
  const highest = values.reduce((high, value) => Math.max(high, value), Number.NEGATIVE_INFINITY);
  const range = highest - lowest;

  return (value: number) => (range > 0 ? (value - lowest) / range : 0);
}

export type DiversityOptions<Item> = {
  limit: number;
  cap: number;
  penalty: number;
  score: (item: Item) => number;
  groups: (item: Item) => string[];
};

export type DiverseChoice<Item> = { item: Item; score: number; penalty: number };

export function selectDiverse<Item>(
  items: Item[],
  options: DiversityOptions<Item>,
): DiverseChoice<Item>[] {
  const remaining = items.map((item) => ({
    item,
    score: options.score(item),
    groups: options.groups(item),
  }));
  const taken = new Map<string, number>();
  const chosen: DiverseChoice<Item>[] = [];

  while (chosen.length < options.limit && remaining.length > 0) {
    const used = remaining.map((entry) =>
      entry.groups.reduce((most, group) => Math.max(most, taken.get(group) ?? 0), 0),
    );
    let pick = -1;

    for (const [index, entry] of remaining.entries()) {
      if (used[index] >= options.cap) {
        continue;
      }

      if (
        pick < 0 ||
        entry.score * options.penalty ** used[index] >
          remaining[pick].score * options.penalty ** used[pick]
      ) {
        pick = index;
      }
    }

    if (pick < 0) {
      pick = 0;
    }

    const [entry] = remaining.splice(pick, 1);
    const penalty = options.penalty ** used[pick];

    for (const group of entry.groups) {
      taken.set(group, (taken.get(group) ?? 0) + 1);
    }

    chosen.push({ item: entry.item, score: entry.score * penalty, penalty });
  }

  return chosen;
}
