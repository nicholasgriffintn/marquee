import { logError } from "../lib/logging.ts";
import type { Bindings, ViewerContext, ViewingContext } from "../types.ts";
import { embedQuery, readVectors } from "./embeddings.ts";
import { preferenceSummary, type ViewerPreferences } from "./usher.ts";

const TASTE_SAMPLE = 24;
const STATED_FLOOR = 0.2;
const BEHAVIOUR_FULL = 12;
const HALF_LIFE_DAYS = 240;
const RECENCY_FLOOR = 0.15;
const NEGATIVE_SCALE = 0.5;
const NEVER_WEIGHT = -1.2;

type WeightedTitle = { titleId: string; weight: number };

function statusWeight(status: ViewingContext["status"]) {
  if (status === "watched") {
    return 1;
  }

  if (status === "watching") {
    return 0.8;
  }

  if (status === "dropped") {
    return -0.6;
  }

  return 0.5;
}

function ratingWeight(rating: number | null) {
  if (rating === null) {
    return 1;
  }

  if (rating >= 5) {
    return 1.6;
  }

  if (rating === 4) {
    return 1.3;
  }

  if (rating === 3) {
    return 0.7;
  }

  return rating === 2 ? -0.5 : -1.1;
}

function recencyWeight(updatedAt: string) {
  const stamped = Date.parse(updatedAt);

  if (Number.isNaN(stamped)) {
    return RECENCY_FLOOR;
  }

  const ageDays = Math.max(0, (Date.now() - stamped) / 86_400_000);

  return Math.max(RECENCY_FLOOR, 0.5 ** (ageDays / HALF_LIFE_DAYS));
}

export function weighTitles(
  viewer: ViewerContext,
  never: string[] = [],
  sample = TASTE_SAMPLE,
): WeightedTitle[] {
  const weighted = viewer.entries.map((entry): WeightedTitle => {
    const base = statusWeight(entry.status) * ratingWeight(entry.rating);

    return { titleId: entry.titleId, weight: base * recencyWeight(entry.updatedAt) };
  });
  const seen = new Set(weighted.map((entry) => entry.titleId));
  const refused = never
    .filter((titleId) => !seen.has(titleId))
    .map((titleId): WeightedTitle => ({ titleId, weight: NEVER_WEIGHT }));

  return (
    [...weighted, ...refused]
      .filter((entry) => entry.weight !== 0)
      // oxlint-disable-next-line no-array-sort
      .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
      .slice(0, sample)
  );
}

export function likedCount(weighted: WeightedTitle[]) {
  return weighted.filter((entry) => entry.weight > 0).length;
}

function blend(vectors: { values: number[]; weight: number }[]) {
  const positive = vectors.filter((entry) => entry.weight > 0);

  if (positive.length === 0) {
    return null;
  }

  const dimensions = positive[0].values.length;
  const result = Array.from<number>({ length: dimensions }).fill(0);
  const positiveTotal = positive.reduce((total, entry) => total + entry.weight, 0);
  const negatives = vectors.filter((entry) => entry.weight < 0);
  const negativeTotal = negatives.reduce((total, entry) => total + Math.abs(entry.weight), 0);
  const negativeCap = Math.min(negativeTotal, positiveTotal * NEGATIVE_SCALE);
  const negativeScale = negativeTotal > 0 ? negativeCap / negativeTotal : 0;

  for (const entry of positive) {
    for (let index = 0; index < dimensions; index += 1) {
      result[index] += ((entry.values[index] ?? 0) * entry.weight) / positiveTotal;
    }
  }

  for (const entry of negatives) {
    const share = (Math.abs(entry.weight) * negativeScale) / (positiveTotal || 1);

    for (let index = 0; index < dimensions; index += 1) {
      result[index] -= (entry.values[index] ?? 0) * share;
    }
  }

  return result;
}

function normalise(vector: number[]) {
  const length = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

  return length > 0 ? vector.map((value) => value / length) : vector;
}

export async function behaviourVector(env: Bindings, weighted: WeightedTitle[]) {
  if (weighted.length === 0) {
    return null;
  }

  try {
    const byId = await readVectors(
      env,
      weighted.map((entry) => entry.titleId),
    );
    const found = weighted.flatMap((entry) => {
      const values = byId.get(entry.titleId);

      return values ? [{ values, weight: entry.weight }] : [];
    });

    return found.length ? blend(found) : null;
  } catch (error) {
    logError("taste_vector_failed", error);

    return null;
  }
}

export async function statedVector(env: Bindings, summary: string) {
  if (!summary) {
    return null;
  }

  try {
    return await embedQuery(env, summary);
  } catch (error) {
    logError("stated_vector_failed", error);

    return null;
  }
}

export function statedWeight(savedCount: number) {
  if (savedCount <= 0) {
    return 1;
  }

  if (savedCount >= BEHAVIOUR_FULL) {
    return STATED_FLOOR;
  }

  return 1 - (1 - STATED_FLOOR) * (savedCount / BEHAVIOUR_FULL);
}

export async function tasteVector(
  env: Bindings,
  viewer: ViewerContext,
  preferences: ViewerPreferences,
  options: { never?: string[]; summary?: string } = {},
) {
  const weighted = weighTitles(viewer, options.never ?? []);
  const [behaviour, stated] = await Promise.all([
    behaviourVector(env, weighted),
    statedVector(env, options.summary ?? preferenceSummary(preferences)),
  ]);

  if (!behaviour) {
    return stated ? normalise(stated) : null;
  }

  if (!stated) {
    return normalise(behaviour);
  }

  const weight = statedWeight(likedCount(weighted));
  const blended = behaviour.map(
    (value, index) => value * (1 - weight) + (stated[index] ?? 0) * weight,
  );

  console.log(JSON.stringify({ event: "taste_blended", weight: Math.round(weight * 100) / 100 }));

  return normalise(blended);
}
