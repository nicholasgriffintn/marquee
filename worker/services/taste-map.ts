import { logError } from "../lib/logging.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { weighTitles } from "./taste.ts";

const MAP_SAMPLE = 60;
const POWER_ITERATIONS = 24;

export type MapPoint = {
  titleId: string;
  title: string;
  genre: string;
  weight: number;
  x: number;
  y: number;
};

function centre(vectors: number[][]) {
  const dimensions = vectors[0].length;
  const mean = Array.from<number>({ length: dimensions }).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      mean[index] += (vector[index] ?? 0) / vectors.length;
    }
  }

  return vectors.map((vector) => vector.map((value, index) => value - (mean[index] ?? 0)));
}

function normalise(vector: number[]) {
  const length = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

  return length > 0 ? vector.map((value) => value / length) : vector;
}

function dot(left: number[], right: number[]) {
  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return total;
}

function leadingComponent(rows: number[][], seed: number) {
  const dimensions = rows[0].length;
  let vector = Array.from({ length: dimensions }, (_, index) =>
    Math.sin((index + 1) * (seed + 1) * 0.7331),
  );

  vector = normalise(vector);

  for (let step = 0; step < POWER_ITERATIONS; step += 1) {
    const next = Array.from<number>({ length: dimensions }).fill(0);

    for (const row of rows) {
      const scale = dot(row, vector);

      for (let index = 0; index < dimensions; index += 1) {
        next[index] += (row[index] ?? 0) * scale;
      }
    }

    vector = normalise(next);
  }

  return vector;
}

function spread(values: number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);

  return high - low || 1;
}

function deflate(rows: number[][], component: number[]) {
  return rows.map((row) => {
    const scale = dot(row, component);

    return row.map((value, index) => value - scale * (component[index] ?? 0));
  });
}

export async function buildTasteMap(env: Bindings, viewerId: string): Promise<MapPoint[]> {
  try {
    const viewer = await readViewerContext(env.DB, viewerId);
    const weighted = weighTitles(viewer).slice(0, MAP_SAMPLE);

    if (weighted.length < 4) {
      return [];
    }

    const vectors = await env.VECTORS.getByIds(weighted.map((entry) => entry.titleId));
    const found = weighted.flatMap((entry) => {
      const match = vectors.find((vector) => vector.id === entry.titleId);

      return match && Array.isArray(match.values)
        ? [{ titleId: entry.titleId, weight: entry.weight, values: match.values as number[] }]
        : [];
    });

    if (found.length < 4) {
      return [];
    }

    const centred = centre(found.map((entry) => entry.values));
    const first = leadingComponent(centred, 0);
    const second = leadingComponent(deflate(centred, first), 1);
    const titles = await readItems(
      env.DB,
      found.map((entry) => entry.titleId),
    );
    const byId = new Map(titles.map((title) => [title.id, title]));
    const points = found.map((entry, index) => {
      const title = byId.get(entry.titleId);
      const row = centred[index] ?? [];

      return {
        titleId: entry.titleId,
        title: title?.title ?? entry.titleId,
        genre: title?.genres[0] ?? "Other",
        weight: entry.weight,
        x: dot(row, first),
        y: dot(row, second),
      };
    });
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    const xSpread = spread(xs);
    const ySpread = spread(ys);
    const xLow = Math.min(...xs);
    const yLow = Math.min(...ys);

    return points.map((point) => ({
      ...point,
      x: Math.round(((point.x - xLow) / xSpread) * 1000) / 1000,
      y: Math.round(((point.y - yLow) / ySpread) * 1000) / 1000,
    }));
  } catch (error) {
    logError("taste_map_failed", error);

    return [];
  }
}
