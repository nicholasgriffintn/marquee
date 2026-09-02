import type { RoomKind } from "../../src/domain/screening.ts";
import type { WorkerBindings } from "../types.ts";

const INDEX_KEY = "screenings:index";
const INDEX_LIMIT = 100;

export type ScreeningIndexEntry = {
  id: string;
  kind: RoomKind;
  title: string;
  path: string;
  hostId: string;
  createdAt: string;
};

export async function listScreenings(env: Pick<WorkerBindings, "CACHE">) {
  return (await env.CACHE.get<ScreeningIndexEntry[]>(INDEX_KEY, { type: "json" })) ?? [];
}

export async function recordScreening(
  env: Pick<WorkerBindings, "CACHE">,
  entry: ScreeningIndexEntry,
) {
  const existing = await listScreenings(env);
  const next = [entry, ...existing.filter((known) => known.id !== entry.id)].slice(0, INDEX_LIMIT);

  await env.CACHE.put(INDEX_KEY, JSON.stringify(next));
}
