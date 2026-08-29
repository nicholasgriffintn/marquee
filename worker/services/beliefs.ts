import { beliefSteersPicks, evidenceConfidence, type Belief } from "../../src/domain/notebook.ts";
import { logError } from "../lib/logging.ts";
import { jsonStringList } from "../lib/values.ts";
import { readBeliefs, writeDerivedBeliefs, type BeliefDraft } from "../repositories/beliefs.ts";
import { readSignals } from "../repositories/signals.ts";
import type { Bindings, ViewingContext } from "../types.ts";
import { noteFacets } from "./note-facets.ts";
import { weighTitles } from "./taste.ts";
import { preferenceSummary, readViewerPreferences, type ViewerPreferences } from "./usher.ts";

const MIN_EVIDENCE = 3;

const GENRE_ALIASES: Record<string, string[]> = {
  "action & adventure": ["action", "adventure"],
  "sci-fi & fantasy": ["science fiction", "fantasy"],
  "war & politics": ["war"],
  "science fiction": ["science fiction"],
};

function canonicalGenres(genres: string[]) {
  return [
    ...new Set(
      genres.flatMap((genre) => {
        const key = genre.trim().toLowerCase();

        return GENRE_ALIASES[key] ?? [key];
      }),
    ),
  ].filter(Boolean);
}

const RUNTIME_SHARE = 0.7;
const SHORT_RUNTIME = 120;

type TitleFacts = {
  titleId: string;
  genres: string[];
  people: string[];
  runtimeMinutes: number | null;
};

type FactRow = { id: string; genres: string | null; people: string | null; runtime: number | null };

async function factsFor(db: Database, titleIds: string[]): Promise<TitleFacts[]> {
  if (titleIds.length === 0) {
    return [];
  }

  const rows = await db.query<FactRow>(
    `SELECT id,
              (SELECT json_group_array(genre) FROM
                (SELECT genre FROM catalog_title_genres
                  WHERE title_id = catalog_titles.id ORDER BY position)) AS genres,
              (SELECT json_group_array(person) FROM
                (SELECT person FROM catalog_title_people
                  WHERE title_id = catalog_titles.id ORDER BY position)) AS people,
              runtime_minutes AS runtime
         FROM catalog_titles
        WHERE id IN (${titleIds.map((_, index) => `$${index + 1}`).join(",")})`,
    [...titleIds],
  );

  return rows.rows.map((row) => ({
    titleId: row.id,
    genres: canonicalGenres(jsonStringList(row.genres)),
    people: jsonStringList(row.people),
    runtimeMinutes: row.runtime,
  }));
}

function listPhrase(values: string[]) {
  if (values.length <= 2) {
    return values.join(" and ");
  }

  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function statedDrafts(preferences: ViewerPreferences): BeliefDraft[] {
  const drafts: BeliefDraft[] = [];
  const genres = canonicalGenres(preferences.genres).slice(0, 8);

  if (genres.length) {
    drafts.push({
      key: "genre:stated",
      value: `You told me you reach for ${listPhrase(genres)}.`,
      strength: 0.8,
      confidence: 0.9,
      sourceRule: "stated:genres",
      evidence: [{ kind: "answer", id: "genres" }],
    });
  }

  const people = [...preferences.directors, ...preferences.actors].slice(0, 6);

  if (people.length) {
    drafts.push({
      key: "person:stated",
      value: `You will watch anything with ${listPhrase(people)}.`,
      strength: 0.9,
      confidence: 0.9,
      sourceRule: "stated:people",
      evidence: [{ kind: "answer", id: "actors" }],
    });
  }

  const single = (key: string, value: string, answer: string) =>
    drafts.push({
      key,
      value,
      strength: 0.8,
      confidence: 0.9,
      sourceRule: `stated:${answer}`,
      evidence: [{ kind: "answer", id: answer }],
    });

  if (preferences.runtime === "short") {
    single("runtime:short", "You said you would rather stay under a hundred minutes.", "runtime");
  }

  if (preferences.runtime === "long") {
    single("runtime:long", "You said the longer the better.", "runtime");
  }

  if (preferences.subtitles === "never") {
    single("habit:subtitles", "You would rather not read subtitles.", "subtitles");
  }

  if (preferences.novelty === "rewatch") {
    single("habit:novelty", "You rewatch what you love rather than chase the new.", "novelty");
  }

  if (preferences.novelty === "new") {
    single("habit:novelty", "You would always rather try something new.", "novelty");
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

function derivedDrafts(
  entries: { facts: TitleFacts; weight: number }[],
  stated: Set<string>,
): BeliefDraft[] {
  const drafts: BeliefDraft[] = [];
  const liked = entries.filter((entry) => entry.weight > 0);
  const disliked = entries.filter((entry) => entry.weight < 0);
  const likedGenres = tally(liked, (facts) => facts.genres);
  const strongest = [...likedGenres.values()].reduce(
    (top, entry) => Math.max(top, entry.weight),
    0,
  );

  for (const [genre, total] of likedGenres) {
    if (total.ids.length < MIN_EVIDENCE || stated.has(genre)) {
      continue;
    }

    drafts.push({
      key: `rule:genre:${genre}`,
      value: `You keep coming back to ${genre}, and you never said so.`,
      strength: strongest > 0 ? Math.min(1, total.weight / strongest) : 0.5,
      confidence: evidenceConfidence(total.ids.length),
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
      confidence: evidenceConfidence(total.ids.length),
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
      confidence: evidenceConfidence(total.ids.length),
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
        confidence: evidenceConfidence(short.length),
        sourceRule: "rule:runtime",
        evidence: short.slice(0, 12).map((entry) => ({ kind: "entry" as const, id: entry.id })),
      });
    }
  }

  return drafts;
}

const MOOD_WINDOW_DAYS = 30;
const MOOD_EXPIRY_DAYS = 21;

async function moodDrafts(db: Database, viewerId: string): Promise<BeliefDraft[]> {
  const rejections = await readSignals(db, viewerId, ["rejection"], 120);
  const recent = rejections.filter(
    (signal) => Date.now() - Date.parse(signal.createdAt) < MOOD_WINDOW_DAYS * 86_400_000,
  );

  if (recent.length < MIN_EVIDENCE) {
    return [];
  }

  const facts = await factsFor(db, recent.map((signal) => signal.titleId).filter(Boolean));
  const byId = new Map(facts.map((entry) => [entry.titleId, entry]));
  const totals = new Map<string, string[]>();

  for (const signal of recent) {
    for (const genre of byId.get(signal.titleId)?.genres ?? []) {
      const key = genre.toLowerCase();

      totals.set(key, [...(totals.get(key) ?? []), signal.titleId]);
    }
  }

  return [...totals.entries()]
    .filter(([, ids]) => ids.length >= MIN_EVIDENCE)
    .map(([genre, ids]) => ({
      key: `rule:mood:${genre}`,
      value: `Lately you have turned down ${genre} more than once. Off it for now, perhaps.`,
      strength: Math.min(1, ids.length / 5),
      confidence: 0.4,
      sourceRule: "rule:recent-rejections",
      expiresInDays: MOOD_EXPIRY_DAYS,
      evidence: ids.slice(0, 12).map((id) => ({ kind: "signal" as const, id })),
    }));
}

async function serviceDrafts(db: Database, viewerId: string): Promise<BeliefDraft[]> {
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
    confidence: evidenceConfidence(ids.length),
    sourceRule: "rule:provider-exit",
    evidence: ids.slice(0, 12).map((id) => ({ kind: "signal" as const, id })),
  }));
}

export async function refreshBeliefs(
  env: Bindings,
  viewerId: string,
  entries: ViewingContext[],
  options: { includeFacets?: boolean } = {},
) {
  try {
    const preferences = await readViewerPreferences(env.DB, viewerId);
    const weighted = weighTitles(entries);
    const facts = await factsFor(
      env.DB,
      weighted.map((entry) => entry.titleId),
    );
    const byId = new Map(facts.map((entry) => [entry.titleId, entry]));
    const weightedFacts = weighted.flatMap((entry) => {
      const found = byId.get(entry.titleId);

      return found ? [{ facts: found, weight: entry.weight }] : [];
    });
    const stated = new Set(canonicalGenres(preferences.genres));
    const drafts = [
      ...statedDrafts(preferences),
      ...derivedDrafts(weightedFacts, stated),
      ...(await serviceDrafts(env.DB, viewerId)),
      ...(await moodDrafts(env.DB, viewerId)),
      ...(options.includeFacets ? await noteFacets(env, viewerId) : []),
    ];

    await writeDerivedBeliefs(env.DB, viewerId, drafts);

    return drafts.length;
  } catch (error) {
    logError("beliefs_refresh_failed", error);

    return 0;
  }
}

const SUMMARY_FLOOR = 0.2;
const SUMMARY_LIMIT = 14;

export function beliefSummary(beliefs: Belief[]) {
  const steering = beliefs
    .filter(
      (belief) => beliefSteersPicks(belief) && belief.confidence * belief.strength >= SUMMARY_FLOOR,
    )
    .slice(0, SUMMARY_LIMIT);

  return steering.map((belief) => belief.value).join(" ");
}

export async function viewerSummary(env: Bindings, viewerId: string, fallback: ViewerPreferences) {
  const beliefs = await readBeliefs(env.DB, viewerId);
  const summary = beliefSummary(beliefs);

  return summary || preferenceSummary(fallback);
}
