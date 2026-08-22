import { logError } from "../lib/logging.ts";
import type { Bindings, ViewerContext } from "../types.ts";
import { embedQuery } from "./embeddings.ts";
import { preferenceSummary, type ViewerPreferences } from "./usher.ts";

const TASTE_SAMPLE = 16;
const STATED_FLOOR = 0.2;
const BEHAVIOUR_FULL = 12;

function likedTitleIds(viewer: ViewerContext) {
  return viewer.entries
    .filter((entry) => entry.status !== "dropped" && (entry.rating === null || entry.rating >= 3))
    .slice(0, TASTE_SAMPLE)
    .map((entry) => entry.titleId);
}

function mean(vectors: number[][]) {
  const dimensions = vectors[0].length;
  const result = Array.from<number>({ length: dimensions }).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      result[index] += (vector[index] ?? 0) / vectors.length;
    }
  }

  return result;
}

function normalise(vector: number[]) {
  const length = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

  return length > 0 ? vector.map((value) => value / length) : vector;
}

export async function behaviourVector(env: Bindings, viewer: ViewerContext) {
  const ids = likedTitleIds(viewer);

  if (ids.length === 0) {
    return null;
  }

  try {
    const vectors = await env.VECTORS.getByIds(ids);
    const values = vectors.flatMap((vector) =>
      Array.isArray(vector.values) ? [vector.values] : [],
    );

    return values.length ? mean(values) : null;
  } catch (error) {
    logError("taste_vector_failed", error);

    return null;
  }
}

export async function statedVector(env: Bindings, preferences: ViewerPreferences) {
  const summary = preferenceSummary(preferences);

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
) {
  const [behaviour, stated] = await Promise.all([
    behaviourVector(env, viewer),
    statedVector(env, preferences),
  ]);

  if (!behaviour) {
    return stated ? normalise(stated) : null;
  }

  if (!stated) {
    return normalise(behaviour);
  }

  const weight = statedWeight(likedTitleIds(viewer).length);
  const blended = behaviour.map(
    (value, index) => value * (1 - weight) + (stated[index] ?? 0) * weight,
  );

  console.log(JSON.stringify({ event: "taste_blended", weight: Math.round(weight * 100) / 100 }));

  return normalise(blended);
}
