import {
  fetchPersonAwards,
  fetchTitleAwards,
  type AwardStatement,
} from "../clients/wikidata-awards.ts";
import { logError, logEvent } from "../lib/logging.ts";
import {
  personAwardCandidates,
  storePersonAwards,
  storeTitleAwards,
  titleAwardCandidates,
} from "../repositories/awards.ts";
import type { Bindings } from "../types.ts";

const TITLE_SAMPLE = 150;
const PERSON_SAMPLE = 150;
const REFRESH_DAYS = 30;

function byKey(statements: AwardStatement[]) {
  const grouped = new Map<string, AwardStatement[]>();

  for (const statement of statements) {
    grouped.set(statement.key, [...(grouped.get(statement.key) ?? []), statement]);
  }

  return grouped;
}

async function syncTitleAwards(env: Bindings) {
  const candidates = await titleAwardCandidates(env.DB, TITLE_SAMPLE, REFRESH_DAYS);

  if (candidates.length === 0) {
    return 0;
  }

  const statements = await fetchTitleAwards(candidates.map((candidate) => candidate.entityId));
  const grouped = byKey(statements);

  await storeTitleAwards(
    env.DB,
    candidates.map((candidate) => ({
      titleId: candidate.titleId,
      entityId: candidate.entityId,
      entries: grouped.get(candidate.entityId) ?? [],
    })),
  );

  const decorated = candidates.filter((candidate) => grouped.has(candidate.entityId)).length;

  logEvent("title_awards_synced", {
    titles: candidates.length,
    decorated,
    statements: statements.length,
  });

  return decorated;
}

async function syncPersonAwards(env: Bindings) {
  const candidates = await personAwardCandidates(env.DB, PERSON_SAMPLE, REFRESH_DAYS);

  if (candidates.length === 0) {
    return 0;
  }

  const statements = await fetchPersonAwards(candidates);
  const grouped = byKey(statements);

  await storePersonAwards(
    env.DB,
    candidates.map((personId) => ({
      personId,
      entries: grouped.get(String(personId)) ?? [],
    })),
  );

  const decorated = candidates.filter((personId) => grouped.has(String(personId))).length;

  logEvent("person_awards_synced", {
    people: candidates.length,
    decorated,
    statements: statements.length,
  });

  return decorated;
}

export async function syncAwards(env: Bindings) {
  let synced = 0;

  for (const run of [syncTitleAwards, syncPersonAwards]) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      synced += await run(env);
    } catch (error) {
      logError("awards_sync_failed", error, { run: run.name });
    }
  }

  return synced;
}
