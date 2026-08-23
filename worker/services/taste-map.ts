import type { MediaTitle, MediaType } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { embedTitles, readVectors } from "./embeddings.ts";
import { weighTitles } from "./taste.ts";

const MAP_SAMPLE = 60;
const MINIMUM_POINTS = 4;
const POWER_ITERATIONS = 24;
const REPAIR_LIMIT = 24;
const SEPARATION = 0.045;
const RELAX_PASSES = 240;
const AXIS_END_SHARE = 0.34;
const AXIS_MIN_END = 3;
const AXIS_MIN_HITS = 2;
const AXIS_MIN_MARGIN = 0.3;
const TRAIT_GENRES = 3;
const TRAIT_KEYWORDS = 6;

export type MapPoint = {
  titleId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  tmdbId: number;
  genre: string;
  weight: number;
  x: number;
  y: number;
  nearest: string | null;
};

export type MapAxis = { low: string; high: string } | null;

export type TasteMap = {
  status: "ready" | "sparse" | "pending";
  points: MapPoint[];
  shelfCount: number;
  mappedCount: number;
  axes: { x: MapAxis; y: MapAxis };
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

function cosine(left: number[], right: number[]) {
  const scale = Math.sqrt(dot(left, left)) * Math.sqrt(dot(right, right));

  return scale > 0 ? dot(left, right) / scale : 0;
}

function nearestNeighbours(vectors: number[][]) {
  return vectors.map((vector, index) => {
    let best = -1;
    let bestScore = -Infinity;

    for (let other = 0; other < vectors.length; other += 1) {
      if (other === index) {
        continue;
      }

      const score = cosine(vector, vectors[other]);

      if (score > bestScore) {
        bestScore = score;
        best = other;
      }
    }

    return best;
  });
}

type Placed = { x: number; y: number };

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function relax(placed: Placed[]) {
  const spaced = placed.map((point) => ({ ...point }));

  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    let moved = false;

    for (let left = 0; left < spaced.length; left += 1) {
      for (let right = left + 1; right < spaced.length; right += 1) {
        const dx = spaced[right].x - spaced[left].x;
        const dy = spaced[right].y - spaced[left].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= SEPARATION) {
          continue;
        }

        const angle = distance > 0 ? Math.atan2(dy, dx) : (left * 2.399963) % (Math.PI * 2);
        const push = (SEPARATION - distance) / 2;

        spaced[left].x = clamp(spaced[left].x - Math.cos(angle) * push);
        spaced[left].y = clamp(spaced[left].y - Math.sin(angle) * push);
        spaced[right].x = clamp(spaced[right].x + Math.cos(angle) * push);
        spaced[right].y = clamp(spaced[right].y + Math.sin(angle) * push);
        moved = true;
      }
    }

    if (!moved) {
      break;
    }
  }

  return spaced;
}

function traits(title: MediaTitle | undefined) {
  if (!title) {
    return [];
  }

  return [
    ...title.genres.slice(0, TRAIT_GENRES),
    ...(title.keywords ?? []).slice(0, TRAIT_KEYWORDS),
  ]
    .map((trait) => trait.trim())
    .filter(Boolean);
}

function share(groups: string[][], trait: string) {
  const key = trait.toLowerCase();
  const hits = groups.filter((group) => group.some((entry) => entry.toLowerCase() === key)).length;

  return { hits, share: hits / groups.length };
}

function endLabel(mine: string[][], theirs: string[][]) {
  const candidates = [...new Set(mine.flat().map((trait) => trait.toLowerCase()))];
  let best: { label: string; margin: number } | null = null;

  for (const candidate of candidates) {
    const here = share(mine, candidate);

    if (here.hits < AXIS_MIN_HITS) {
      continue;
    }

    const margin = here.share - share(theirs, candidate).share;

    if (margin >= AXIS_MIN_MARGIN && (!best || margin > best.margin)) {
      const label = mine.flat().find((trait) => trait.toLowerCase() === candidate) ?? candidate;

      best = { label, margin };
    }
  }

  return best?.label ?? null;
}

function nameAxis(order: number[], traitsByIndex: string[][]): MapAxis {
  const end = Math.max(AXIS_MIN_END, Math.round(order.length * AXIS_END_SHARE));

  if (order.length < end * 2) {
    return null;
  }

  const lowGroup = order.slice(0, end).map((index) => traitsByIndex[index]);
  const highGroup = order.slice(-end).map((index) => traitsByIndex[index]);
  const low = endLabel(lowGroup, highGroup);
  const high = endLabel(highGroup, lowGroup);

  return low && high && low.toLowerCase() !== high.toLowerCase() ? { low, high } : null;
}

async function repairVectors(env: Bindings, titleIds: string[], force: boolean) {
  try {
    await embedTitles(env, titleIds.slice(0, REPAIR_LIMIT), { force });
  } catch (error) {
    logError("taste_map_repair_failed", error);
  }
}

function empty(status: TasteMap["status"], shelfCount: number, mappedCount = 0): TasteMap {
  return { status, points: [], shelfCount, mappedCount, axes: { x: null, y: null } };
}

export async function buildTasteMap(
  env: Bindings,
  viewerId: string,
  options: { schedule?: (task: Promise<unknown>) => void } = {},
): Promise<TasteMap> {
  const viewer = await readViewerContext(env.DB, viewerId);
  const weighted = weighTitles(viewer, [], MAP_SAMPLE);

  if (weighted.length < MINIMUM_POINTS) {
    return empty("sparse", weighted.length);
  }

  const byId = await readVectors(
    env,
    weighted.map((entry) => entry.titleId),
  );
  const missing = weighted.map((entry) => entry.titleId).filter((titleId) => !byId.has(titleId));
  const found = weighted.flatMap((entry) => {
    const values = byId.get(entry.titleId);

    return values ? [{ titleId: entry.titleId, weight: entry.weight, values }] : [];
  });

  if (missing.length > 0) {
    const task = repairVectors(env, missing, found.length < MINIMUM_POINTS);

    if (options.schedule) {
      options.schedule(task);
    } else {
      await task;
    }
  }

  if (found.length < MINIMUM_POINTS) {
    return empty("pending", weighted.length, found.length);
  }

  const centred = centre(found.map((entry) => entry.values));
  const first = leadingComponent(centred, 0);
  const second = leadingComponent(deflate(centred, first), 1);
  const titles = await readItems(
    env.DB,
    found.map((entry) => entry.titleId),
    found.length,
  );
  const byTitleId = new Map(titles.map((title) => [title.id, title]));
  const raw = found.map((entry, index) => {
    const row = centred[index] ?? [];

    return { x: dot(row, first), y: dot(row, second) };
  });
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  const xSpread = spread(xs);
  const ySpread = spread(ys);
  const xLow = Math.min(...xs);
  const yLow = Math.min(...ys);
  const placed = relax(
    raw.map((point) => ({ x: (point.x - xLow) / xSpread, y: (point.y - yLow) / ySpread })),
  );
  const neighbours = nearestNeighbours(found.map((entry) => entry.values));
  const traitsByIndex = found.map((entry) => traits(byTitleId.get(entry.titleId)));
  const byX = found.map((_, index) => index);
  const byY = [...byX];

  byX.sort((left, right) => raw[left].x - raw[right].x);
  byY.sort((left, right) => raw[left].y - raw[right].y);

  const points = found.map((entry, index): MapPoint => {
    const title = byTitleId.get(entry.titleId);
    const neighbour = neighbours[index];
    const nearestTitle = neighbour >= 0 ? byTitleId.get(found[neighbour].titleId) : undefined;

    return {
      titleId: entry.titleId,
      title: title?.title ?? entry.titleId,
      year: title?.year ?? null,
      mediaType: title?.mediaType ?? "movie",
      tmdbId: title?.tmdbId ?? 0,
      genre: title?.genres[0] ?? "Other",
      weight: Math.round(entry.weight * 1000) / 1000,
      x: Math.round(placed[index].x * 1000) / 1000,
      y: Math.round(placed[index].y * 1000) / 1000,
      nearest: nearestTitle?.title ?? null,
    };
  });

  return {
    status: "ready",
    points,
    shelfCount: weighted.length,
    mappedCount: points.length,
    axes: { x: nameAxis(byX, traitsByIndex), y: nameAxis(byY, traitsByIndex) },
  };
}
