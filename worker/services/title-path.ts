import type { ViewerAccess } from "../../src/domain/access.ts";
import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { cosine, normalise } from "../lib/vector.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";
import { nearestTo, readVectors } from "./embeddings.ts";

const MAX_HOPS = 8;
const CANDIDATES_PER_HOP = 24;
const SAME_THING_AGAIN = 0.78;

export type PathStep = {
  title: MediaTitle;
  toStart: number;
  toEnd: number;
};

export type TitlePath = {
  steps: PathStep[];
  arrived: boolean;
  hops: number;
};

const NO_PATH: TitlePath = { steps: [], arrived: false, hops: 0 };

function between(start: number[], target: number[], ratio: number) {
  return normalise(start.map((value, index) => value * (1 - ratio) + (target[index] ?? 0) * ratio));
}

export async function walkBetweenTitles(
  env: Bindings,
  fromId: string,
  toId: string,
  access: ViewerAccess,
  maxHops = 6,
): Promise<TitlePath> {
  if (fromId === toId) {
    return NO_PATH;
  }

  const hops = clamp(maxHops, 2, MAX_HOPS);

  try {
    const ends = await readVectors(env, [fromId, toId]);
    const start = ends.get(fromId);
    const target = ends.get(toId);

    if (!start || !target) {
      return NO_PATH;
    }

    const visited = new Set([fromId, toId]);
    const chosen: string[] = [];
    let previous = start;
    let reached = cosine(start, target);

    for (let hop = 1; hop < hops; hop += 1) {
      const waypoint = between(start, target, hop / hops);
      // oxlint-disable-next-line no-await-in-loop
      const neighbours = await nearestTo(env, waypoint, {});
      const shortlist = neighbours
        .filter((neighbour) => !visited.has(neighbour.id))
        .slice(0, CANDIDATES_PER_HOP)
        .map((neighbour) => neighbour.id);

      if (shortlist.length === 0) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop
      const [known, candidates] = await Promise.all([
        readItems(env.DB, shortlist, access, shortlist.length),
        readVectors(env, shortlist),
      ]);
      const closer = shortlist.filter((id) => {
        const vector = candidates.get(id);

        return (
          known.some((item) => item.id === id) &&
          vector !== undefined &&
          cosine(vector, target) > reached
        );
      });
      const next =
        closer.find((id) => {
          const vector = candidates.get(id);

          return vector ? cosine(vector, previous) <= SAME_THING_AGAIN : false;
        }) ?? closer[0];

      if (next) {
        visited.add(next);
        chosen.push(next);
        previous = candidates.get(next) ?? previous;
        reached = cosine(previous, target);
      }
    }

    const ordered = [fromId, ...chosen, toId];
    const [titles, vectors] = await Promise.all([
      readItems(env.DB, ordered, access, ordered.length),
      readVectors(env, ordered),
    ]);
    const byId = new Map(titles.map((item): [string, MediaTitle] => [item.id, item]));

    const steps = ordered.flatMap((id): PathStep[] => {
      const title = byId.get(id);
      const vector = vectors.get(id);

      if (!title || !vector) {
        return [];
      }

      return [{ title, toStart: cosine(vector, start), toEnd: cosine(vector, target) }];
    });

    return {
      steps,
      arrived: steps.at(-1)?.title.id === toId,
      hops: Math.max(steps.length - 1, 0),
    };
  } catch (error) {
    logError("title_path_failed", error, { area: "retrieval" });

    return NO_PATH;
  }
}
