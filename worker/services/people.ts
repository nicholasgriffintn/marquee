import { getTmdbPeople } from "../clients/tmdb.ts";
import { logEvent } from "../lib/logging.ts";
import { storePeople } from "../repositories/catalog-writer.ts";
import {
  markPeopleVerified,
  unverifiedPeople,
} from "../repositories/people.ts";
import type { Bindings } from "../types.ts";

const SAMPLE = 500;

export async function refreshPeople(env: Bindings) {
  const candidates = await unverifiedPeople(env.DB, SAMPLE);

  if (candidates.length === 0) {
    return { written: 0, done: true };
  }

  const people = await getTmdbPeople(env, candidates);
  const written = await storePeople(env.DB, people);

  await markPeopleVerified(env.DB, candidates);

  logEvent("people_refreshed", { read: candidates.length, written });

  return { written, done: candidates.length < SAMPLE };
}
