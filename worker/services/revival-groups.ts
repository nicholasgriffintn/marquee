import { logEvent } from "../lib/logging.ts";
import { readGroupCandidates, storeGroups, type GroupCandidate } from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";

const RUNTIME_TOLERANCE = 0.1;
const WRITE_CHUNK = 200;

function printQuality(work: GroupCandidate) {
  return [
    work.popularity ?? 0,
    work.plays,
    Math.round((work.streamBytes ?? 0) / 1_048_576),
    work.height ?? 0,
  ];
}

function better(candidate: GroupCandidate, held: GroupCandidate) {
  const left = printQuality(candidate);
  const right = printQuality(held);

  for (const [index, value] of left.entries()) {
    if (value !== right[index]) {
      return value > right[index];
    }
  }

  return false;
}

export function clusterPrints(works: GroupCandidate[]) {
  const byTitle = new Map<string, GroupCandidate[]>();

  for (const work of works) {
    const title = work.sortTitle.trim();

    if (!title || !work.runtimeSeconds) {
      continue;
    }

    byTitle.set(title, [...(byTitle.get(title) ?? []), work]);
  }

  const clusters: GroupCandidate[][] = [];

  for (const items of byTitle.values()) {
    const ordered = [...items].sort(
      (left, right) => (left.runtimeSeconds ?? 0) - (right.runtimeSeconds ?? 0),
    );
    let run: GroupCandidate[] = [];

    for (const work of ordered) {
      const previous = run.at(-1);
      const within =
        previous &&
        (work.runtimeSeconds ?? 0) <= (previous.runtimeSeconds ?? 0) * (1 + RUNTIME_TOLERANCE);

      if (previous && !within) {
        clusters.push(run);
        run = [];
      }

      run.push(work);
    }

    if (run.length > 0) {
      clusters.push(run);
    }
  }

  return clusters;
}

export async function groupRevivalPrints(env: Bindings) {
  const works = await readGroupCandidates(env.DB);
  const clusters = clusterPrints(works);
  const assignments = clusters.flatMap((cluster) => {
    const [first] = cluster;

    if (!first) {
      return [];
    }

    const chosen = cluster.reduce((held, work) => (better(work, held) ? work : held), first);
    const groupId = cluster.length > 1 ? `g.${chosen.id}` : `g.${first.id}`;

    return cluster.map((work) => ({
      id: work.id,
      groupId,
      primary: work.id === chosen.id,
    }));
  });
  let written = 0;

  for (let index = 0; index < assignments.length; index += WRITE_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    written += await storeGroups(env.DB, assignments.slice(index, index + WRITE_CHUNK));
  }

  const shared = clusters.filter((cluster) => cluster.length > 1);

  logEvent("revival_prints_grouped", {
    works: works.length,
    groups: clusters.length,
    shared: shared.length,
    hidden: shared.reduce((sum, cluster) => sum + cluster.length - 1, 0),
    written,
  });

  return {
    works: works.length,
    groups: clusters.length,
    shared: shared.length,
    hidden: shared.reduce((sum, cluster) => sum + cluster.length - 1, 0),
    written,
  };
}
