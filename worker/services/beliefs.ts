import type { Belief } from "../../src/domain/notebook.ts";
import { logError } from "../lib/logging.ts";
import {
  activeBeliefs,
  readBeliefs,
  writeDerivedBeliefs,
  type BeliefDraft,
} from "../repositories/beliefs.ts";
import { readSignals } from "../repositories/signals.ts";
import type { Bindings, ViewerContext } from "../types.ts";
import { weighTitles } from "./taste.ts";
import { preferenceSummary, readViewerPreferences, type ViewerPreferences } from "./usher.ts";

const MIN_EVIDENCE = 3;
const RUNTIME_SHARE = 0.7;
const SHORT_RUNTIME = 120;

type TitleFacts = {
  titleId: string;
  genres: string[];
  people: string[];
  runtimeMinutes: number | null;
};

type FactRow = { id: string; genres: string | null; people: string | null; runtime: number | null };

function parseList(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

async function factsFor(db: D1Database, titleIds: string[]): Promise<TitleFacts[]> {
  if (titleIds.length === 0) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT id,
              json_extract(payload, '$.genres') AS genres,
              json_extract(payload, '$.people') AS people,
              json_extract(payload, '$.runtimeMinutes') AS runtime
         FROM catalog_titles
        WHERE id IN (${titleIds.map(() => "?").join(",")})`,
    )
    .bind(...titleIds)
    .all<FactRow>();

  return rows.results.map((row) => ({
    titleId: row.id,
    genres: parseList(row.genres),
    people: parseList(row.people),
    runtimeMinutes: row.runtime,
  }));
}

function confidenceFor(count: number) {
  return Math.min(0.8, 0.25 + count * 0.12);
}

function statedDrafts(preferences: ViewerPreferences): BeliefDraft[] {
  const drafts: BeliefDraft[] = [];
  const stated = (key: string, value: string, answer: string, strength = 0.8) =>
    drafts.push({
      key,
      value,
      strength,
      confidence: 0.9,
      sourceRule: `stated:${answer}`,
      evidence: [{ kind: "answer", id: answer }],
    });

  for (const genre of preferences.genres.slice(0, 6)) {
    stated(
      `genre:${genre.toLowerCase()}`,
      `You told me you reach for ${genre.toLowerCase()}.`,
      "genres",
    );
  }

  for (const person of [...preferences.directors, ...preferences.actors].slice(0, 6)) {
    stated(
      `person:${person.toLowerCase()}`,
      `You will watch anything with ${person}.`,
      "actors",
      0.9,
    );
  }

  if (preferences.runtime === "short") {
    stated("runtime:short", "You said you would rather stay under a hundred minutes.", "runtime");
  }

  if (preferences.runtime === "long") {
    stated("runtime:long", "You said the longer the better.", "runtime");
  }

  if (preferences.subtitles === "never") {
    stated("habit:subtitles", "You would rather not read subtitles.", "subtitles");
  }

  if (preferences.novelty === "rewatch") {
    stated("habit:novelty", "You rewatch what you love rather than chase the new.", "novelty");
  }

  if (preferences.novelty === "new") {
    stated("habit:novelty", "You would always rather try something new.", "novelty");
  }

  return drafts;
}

function tally(
  entries: { facts: TitleFacts; weight: number }[],
  pick: (facts: TitleFacts) => string[],
) {
  const totals = new Map<string, { weight: number; ids: string[] }>();

  for (const entry of entries) {
    for (const value of pick(entry.facts)) {
      const key = value.toLowerCase();
      const current = totals.get(key) ?? { weight: 0, ids: [] };

      current.weight += entry.weight;
      current.ids.push(entry.facts.titleId);
      totals.set(key, current);
    }
  }

  return totals;
}

function derivedDrafts(entries: { facts: TitleFacts; weight: number }[]): BeliefDraft[] {
  const drafts: BeliefDraft[] = [];
  const liked = entries.filter((entry) => entry.weight > 0);
  const disliked = entries.filter((entry) => entry.weight < 0);
  const likedGenres = tally(liked, (facts) => facts.genres);
  const strongest = [...likedGenres.values()].reduce(
    (top, entry) => Math.max(top, entry.weight),
    0,
  );

  for (const [genre, total] of likedGenres) {
    if (total.ids.length < MIN_EVIDENCE) {
      continue;
    }

    drafts.push({
      key: `rule:genre:${genre}`,
      value: `You keep coming back to ${genre}.`,
      strength: strongest > 0 ? Math.min(1, total.weight / strongest) : 0.5,
      confidence: confidenceFor(total.ids.length),
      sourceRule: "rule:liked-genre",
      evidence: total.ids.map((id) => ({ kind: "entry" as const, id })),
    });
  }

  for (const [genre, total] of tally(disliked, (facts) => facts.genres)) {
    if (total.ids.length < MIN_EVIDENCE || likedGenres.has(genre)) {
      continue;
    }

    drafts.push({
      key: `rule:avoid:${genre}`,
      value: `${genre.charAt(0).toUpperCase()}${genre.slice(1)} rarely lands with you.`,
      strength: Math.min(1, Math.abs(total.weight) / MIN_EVIDENCE),
      confidence: confidenceFor(total.ids.length),
      sourceRule: "rule:disliked-genre",
      evidence: total.ids.map((id) => ({ kind: "entry" as const, id })),
    });
  }

  for (const [person, total] of tally(liked, (facts) => facts.people.slice(0, 6))) {
    if (total.ids.length < MIN_EVIDENCE) {
      continue;
    }

    drafts.push({
      key: `rule:person:${person}`,
      value: `${person.replace(/\b\w/gu, (letter) => letter.toUpperCase())} keeps turning up in what you watch.`,
      strength: Math.min(1, total.ids.length / 5),
      confidence: confidenceFor(total.ids.length),
      sourceRule: "rule:recurring-person",
      evidence: total.ids.map((id) => ({ kind: "entry" as const, id })),
    });
  }

  const timed = liked.flatMap((entry) =>
    entry.facts.runtimeMinutes
      ? [{ id: entry.facts.titleId, runtime: entry.facts.runtimeMinutes }]
      : [],
  );

  if (timed.length >= MIN_EVIDENCE + 2) {
    const short = timed.filter((entry) => entry.runtime <= SHORT_RUNTIME);

    if (short.length / timed.length >= RUNTIME_SHARE) {
      drafts.push({
        key: "rule:runtime:short",
        value: "Almost everything you finish is under two hours.",
        strength: short.length / timed.length,
        confidence: confidenceFor(short.length),
        sourceRule: "rule:runtime",
        evidence: short.slice(0, 12).map((entry) => ({ kind: "entry" as const, id: entry.id })),
      });
    }
  }

  return drafts;
}

async function serviceDrafts(db: D1Database, viewerId: string): Promise<BeliefDraft[]> {
  const exits = await readSignals(db, viewerId, ["provider_exit"], 200);
  const totals = new Map<string, string[]>();

  for (const signal of exits) {
    const providerId =
      typeof signal.context.providerId === "string" ? signal.context.providerId : "";

    if (!providerId) {
      continue;
    }

    totals.set(providerId, [...(totals.get(providerId) ?? []), signal.titleId]);
  }

  const ranked = [...totals.entries()].filter(([, ids]) => ids.length >= MIN_EVIDENCE);

  return ranked.map(([providerId, ids]) => ({
    key: `service:${providerId}`,
    value: `When you actually watch something, it is usually on ${providerId}.`,
    strength: Math.min(1, ids.length / 8),
    confidence: confidenceFor(ids.length),
    sourceRule: "rule:provider-exit",
    evidence: ids.slice(0, 12).map((id) => ({ kind: "signal" as const, id })),
  }));
}

export async function refreshBeliefs(env: Bindings, viewerId: string, viewer: ViewerContext) {
  try {
    const preferences = await readViewerPreferences(env.DB, viewerId);
    const weighted = weighTitles(viewer);
    const facts = await factsFor(
      env.DB,
      weighted.map((entry) => entry.titleId),
    );
    const byId = new Map(facts.map((entry) => [entry.titleId, entry]));
    const entries = weighted.flatMap((entry) => {
      const found = byId.get(entry.titleId);

      return found ? [{ facts: found, weight: entry.weight }] : [];
    });
    const drafts = [
      ...statedDrafts(preferences),
      ...derivedDrafts(entries),
      ...(await serviceDrafts(env.DB, viewerId)),
    ];

    await writeDerivedBeliefs(env.DB, viewerId, drafts);

    return drafts.length;
  } catch (error) {
    logError("beliefs_refresh_failed", error);

    return 0;
  }
}

export function beliefSummary(beliefs: Belief[]) {
  const active = activeBeliefs(beliefs)
    .filter((belief) => belief.confidence * belief.strength >= 0.2)
    .slice(0, 14);

  return active.map((belief) => belief.value).join(" ");
}

export async function viewerSummary(env: Bindings, viewerId: string, fallback: ViewerPreferences) {
  const beliefs = await readBeliefs(env.DB, viewerId);
  const summary = beliefSummary(beliefs);

  return summary || preferenceSummary(fallback);
}
