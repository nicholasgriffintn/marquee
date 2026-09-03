import { providerRegistry } from "../../src/domain/providers.ts";
import {
  NOVELTY,
  RUNTIME_TOLERANCE,
  SUBTITLE_APPETITE,
  WATCH_FREQUENCY,
  WATCH_MOTIVATION,
  type UsherFace,
  type UsherMoment,
  type UsherQuestion,
  type UsherSurface,
} from "../../src/domain/usher.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { stringList } from "../lib/values.ts";
import { readNotebookPreferences } from "../repositories/notebook-preferences.ts";
import { readProviderPreferences, saveProviderPreferences } from "../repositories/profile.ts";
import {
  readAnswers,
  readUsherRecord,
  saveAnswer,
  searchPeople,
  writeUsherRecord,
} from "../repositories/usher.ts";
import type { Bindings } from "../types.ts";
import { getGenres } from "./catalog.ts";

const POPULAR_PROVIDER_IDS = [
  "netflix",
  "prime-video",
  "disney-plus",
  "apple-tv-plus",
  "now",
  "hbo-max",
  "paramount-plus",
  "bbc-iplayer",
  "itvx",
  "channel-4",
  "channel-5",
  "crunchyroll",
];

const CORE_ORDER = ["providers", "genres", "frequency", "motivation", "seen", "actors"];
const DRIP_ORDER = ["directors", "runtime", "subtitles", "novelty"];

const GENRE_CHOICES = 18;
const MAX_PEOPLE = 5;
const MAX_SEEN = 40;
const DRIP_COOLDOWN_DAYS = 3;
const IGNORE_LIMIT = 3;
const QUIET_DAYS = 14;
const STALE_WATCHLIST_DAYS = 60;
const AWAY_DAYS = 21;

function awayPhrase(days: number) {
  if (days >= 330) {
    return "It has been the best part of a year.";
  }

  if (days >= 60) {
    return `Not seen you in ${Math.round(days / 30)} months.`;
  }

  return `Not seen you in ${Math.round(days / 7)} weeks.`;
}

function daysFromNow(count: number) {
  return new Date(Date.now() + count * 86_400_000).toISOString();
}

function isFuture(value: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

async function genreOptions(env: Bindings) {
  try {
    const genres = await getGenres(env, 100);

    return genres.slice(0, GENRE_CHOICES).map((genre) => ({ value: genre, label: genre }));
  } catch (error) {
    logError("usher_genres_failed", error);

    return [];
  }
}

function providerOptions() {
  return POPULAR_PROVIDER_IDS.flatMap((id) => {
    const provider = providerRegistry.find((entry) => entry.id === id);

    return provider ? [{ value: provider.id, label: provider.name }] : [];
  });
}

export async function questionFor(env: Bindings, id: string): Promise<UsherQuestion | null> {
  if (id === "providers") {
    return {
      id,
      kind: "chips",
      line: "Before I suggest anything, what do you actually pay for?",
      hint: "The big ones. You can add the rest on the Sources page.",
      options: providerOptions(),
      min: 0,
      max: POPULAR_PROVIDER_IDS.length,
    };
  }

  if (id === "genres") {
    return {
      id,
      kind: "chips",
      line: "What do you reach for?",
      hint: "Three or four is plenty.",
      options: await genreOptions(env),
      min: 1,
      max: 8,
    };
  }

  if (id === "frequency") {
    return {
      id,
      kind: "single",
      line: "How often is film night?",
      options: WATCH_FREQUENCY,
    };
  }

  if (id === "motivation") {
    return {
      id,
      kind: "chips",
      line: "And why do you pick what you pick?",
      hint: "This one tells me more than the genres do.",
      options: WATCH_MOTIVATION,
      min: 1,
      max: 4,
    };
  }

  if (id === "seen") {
    return {
      id,
      kind: "titles",
      line: "Tap anything you've already seen. I'll stop offering it.",
      hint: "Search for more if the obvious ones aren't here.",
      max: MAX_SEEN,
    };
  }

  if (id === "actors") {
    return {
      id,
      kind: "people",
      line: "Anyone you'd watch in anything?",
      hint: "Type a name and pick it from the list. Up to five.",
      max: MAX_PEOPLE,
    };
  }

  if (id === "directors") {
    return {
      id,
      kind: "people",
      line: "Any directors you follow?",
      hint: "Type a name and pick it from the list. Up to five.",
      max: MAX_PEOPLE,
    };
  }

  if (id === "runtime") {
    return {
      id,
      kind: "single",
      line: "How long is too long?",
      options: RUNTIME_TOLERANCE,
    };
  }

  if (id === "subtitles") {
    return {
      id,
      kind: "single",
      line: "Do you read subtitles?",
      options: SUBTITLE_APPETITE,
    };
  }

  if (id === "novelty") {
    return {
      id,
      kind: "single",
      line: "New things, or the ones you already love?",
      options: NOVELTY,
    };
  }

  return null;
}

export type MomentContext = {
  railId?: string;
  railName?: string;
  titleId?: string;
  query?: string;
  savedCount?: number;
  unratedCount?: number;
  awayDays?: number;
  idle?: boolean;
};

const FACE_BY_QUESTION: Record<string, UsherFace> = {
  providers: "idle",
  genres: "idle",
  frequency: "thinking",
  motivation: "thinking",
  seen: "unimpressed",
  actors: "pleased",
  directors: "pleased",
};

async function questionMoment(
  env: Bindings,
  id: string,
  kind: string,
  surface: UsherSurface,
  progress?: { step: number; total: number },
): Promise<UsherMoment | null> {
  const question = await questionFor(env, id);

  if (!question || (question.options && question.options.length === 0)) {
    return null;
  }

  return {
    id: `${kind}:${id}`,
    kind,
    surface,
    face: FACE_BY_QUESTION[id] ?? "idle",
    line: question.line,
    question,
    ...progress,
  };
}

async function staleWatchlistMoment(
  env: Bindings,
  viewerId: string,
  titleId: string,
): Promise<UsherMoment | null> {
  const row = await env.DB.first<{ age: number }>(
    `SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) / 86400.0 AS age
     FROM viewing_entries
     WHERE viewer_id = $1 AND title_id = $2 AND status = 'watchlist'`,
    [viewerId, titleId],
  );

  if (!row || row.age < STALE_WATCHLIST_DAYS) {
    return null;
  }

  return {
    id: `stale-watchlist:${titleId}`,
    kind: "stale-watchlist",
    surface: "title",
    face: "unimpressed",
    line: `That has been on your shelf ${Math.round(row.age)} days. Still interested?`,
    actions: [
      { id: "keep", label: "Still keen" },
      { id: "drop", label: "Take it off" },
      { id: "watched", label: "Seen it since" },
    ],
  };
}

export async function nextMoment(
  env: Bindings,
  viewerId: string,
  surface: UsherSurface,
  context: MomentContext = {},
): Promise<UsherMoment | null> {
  const [record, answers] = await Promise.all([
    readUsherRecord(env.DB, viewerId),
    readAnswers(env.DB, viewerId),
  ]);

  if (isFuture(record.snoozedUntil)) {
    return null;
  }

  const seen = new Set([...record.asked, ...answers.keys()]);
  const muted = (kind: string) => isFuture(record.muted[kind] ?? null);

  if (surface === "first-run" && record.status === "dismissed") {
    return null;
  }

  if (surface === "search-empty" && context.query && !muted("search-rescue")) {
    return {
      id: "search-rescue",
      kind: "search-rescue",
      surface,
      face: "thinking",
      line: "Never heard of it. Want me to guess what you meant?",
      actions: [{ id: "rescue", label: "Go on then" }],
    };
  }

  if (surface === "first-run") {
    const pending = CORE_ORDER.find((id) => !seen.has(id));

    if (pending) {
      return questionMoment(env, pending, "onboarding", surface, {
        step: CORE_ORDER.filter((id) => seen.has(id)).length + 1,
        total: CORE_ORDER.length,
      });
    }

    return null;
  }

  if (surface === "title" && context.titleId && !muted("stale-watchlist")) {
    const stale = await staleWatchlistMoment(env, viewerId, context.titleId);

    if (stale) {
      return stale;
    }
  }

  if (surface === "rail" && context.railId && !muted("rail-feedback")) {
    return {
      id: `rail-feedback:${context.railId}`,
      kind: "rail-feedback",
      surface,
      face: "idle",
      line: context.railName ? `Did “${context.railName}” land?` : "Did that shelf land?",
      actions: [
        { id: "good", label: "It did" },
        { id: "bad", label: "Not really" },
      ],
    };
  }

  const quiet = isFuture(
    record.lastPromptedAt
      ? new Date(Date.parse(record.lastPromptedAt) + DRIP_COOLDOWN_DAYS * 86_400_000).toISOString()
      : null,
  );

  if (quiet) {
    return null;
  }

  if (
    surface === "shelf" &&
    !muted("rate-shelf") &&
    (context.unratedCount ?? 0) >= 5 &&
    (context.savedCount ?? 0) >= 5
  ) {
    return {
      id: "rate-shelf",
      kind: "rate-shelf",
      surface,
      face: "idle",
      line: "You have saved a fair bit and rated none of it. Ratings sharpen the shelves.",
      actions: [{ id: "dismiss", label: "Noted" }],
    };
  }

  if (surface === "home" && (context.awayDays ?? 0) >= AWAY_DAYS && !muted("welcome-back")) {
    return {
      id: "welcome-back",
      kind: "welcome-back",
      surface,
      face: "pleased",
      line: `${awayPhrase(context.awayDays ?? 0)} The seats are the same.`,
      actions: [{ id: "dismiss", label: "Good to be back" }],
    };
  }

  if (surface === "home" && !muted("drip")) {
    const pending = [...CORE_ORDER, ...DRIP_ORDER].find((id) => !seen.has(id));

    if (pending) {
      return questionMoment(env, pending, "drip", surface);
    }
  }

  return null;
}

export async function markPrompted(env: Bindings, viewerId: string, moment: UsherMoment) {
  if (moment.kind === "onboarding") {
    return;
  }

  await writeUsherRecord(env.DB, viewerId, {
    lastPromptedAt: new Date().toISOString(),
  });
}

async function mirrorProviderPreferences(db: Database, viewerId: string, providerIds: string[]) {
  try {
    const saved = await readProviderPreferences(db, viewerId);

    await saveProviderPreferences(db, viewerId, [...new Set([...(saved ?? []), ...providerIds])]);
  } catch (error) {
    logError("usher_provider_mirror_failed", error);
  }
}

function chipAnswer(value: unknown, question: UsherQuestion) {
  if (!Array.isArray(value)) {
    return null;
  }

  const allowed = new Set((question.options ?? []).map((option) => option.value));
  const picked = [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && allowed.has(item)),
    ),
  ].slice(0, question.max ?? 8);

  return picked.length >= (question.min ?? 0) ? picked : null;
}

async function peopleAnswer(env: Bindings, value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const names = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 80))
        .filter(Boolean),
    ),
  ].slice(0, MAX_PEOPLE);
  const verified = await Promise.all(
    names.map(async (name) => {
      const matches = await searchPeople(env.DB, name, 5);

      return matches.find((match) => match.toLowerCase() === name.toLowerCase()) ?? null;
    }),
  );

  return verified.filter((name): name is string => Boolean(name));
}

async function titlesAnswer(env: Bindings, viewerId: string, value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const titleIds = [...new Set(value.filter(isKnownTitle))].slice(0, MAX_SEEN);

  if (titleIds.length) {
    await env.DB.transaction(async (transaction) => {
      for (const titleId of titleIds) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts)
           VALUES ($1, $2, $3, 'watched', NULL, '')
           ON CONFLICT(viewer_id, title_id) DO UPDATE SET
             status = 'watched',
             updated_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), viewerId, titleId],
        );
      }
    });
  }

  return titleIds;
}

export async function applyAnswer(
  env: Bindings,
  viewerId: string,
  questionId: string,
  value: unknown,
) {
  const question = await questionFor(env, questionId);

  if (!question) {
    return { ok: false as const, error: "Unknown question" };
  }

  if (question.kind === "chips") {
    if (questionId === "providers") {
      const providerIds = validProviderIds(value).slice(0, 40);

      await saveAnswer(env.DB, viewerId, questionId, providerIds);
      await mirrorProviderPreferences(env.DB, viewerId, providerIds);

      return { ok: true as const, answer: providerIds };
    }

    const answer = chipAnswer(value, question);

    if (!answer) {
      return { ok: false as const, error: "Pick at least one" };
    }

    await saveAnswer(env.DB, viewerId, questionId, answer);

    return { ok: true as const, answer };
  }

  if (question.kind === "single") {
    const allowed = new Set((question.options ?? []).map((option) => option.value));

    if (typeof value !== "string" || !allowed.has(value)) {
      return { ok: false as const, error: "Pick one" };
    }

    await saveAnswer(env.DB, viewerId, questionId, value);

    return { ok: true as const, answer: value };
  }

  if (question.kind === "people") {
    const answer = await peopleAnswer(env, value);

    if (!answer) {
      return {
        ok: false as const,
        error: "Names must be people in the catalogue",
      };
    }

    await saveAnswer(env.DB, viewerId, questionId, answer);

    return { ok: true as const, answer };
  }

  const answer = await titlesAnswer(env, viewerId, value);

  if (!answer) {
    return { ok: false as const, error: "Pick titles from the catalogue" };
  }

  await saveAnswer(env.DB, viewerId, questionId, answer);

  return { ok: true as const, answer };
}

export async function afterAnswer(env: Bindings, viewerId: string) {
  const [record, answers] = await Promise.all([
    readUsherRecord(env.DB, viewerId),
    readAnswers(env.DB, viewerId),
  ]);
  const seen = new Set([...record.asked, ...answers.keys()]);
  const complete = CORE_ORDER.every((id) => seen.has(id));

  await writeUsherRecord(env.DB, viewerId, {
    status: complete ? "done" : "in-progress",
    ignored: 0,
    lastPromptedAt: record.status === "new" ? record.lastPromptedAt : new Date().toISOString(),
  });
}

export async function skipQuestion(env: Bindings, viewerId: string, questionId: string) {
  const record = await readUsherRecord(env.DB, viewerId);

  await writeUsherRecord(env.DB, viewerId, {
    asked: [...new Set([...record.asked, questionId])],
    status: record.status === "new" ? "in-progress" : record.status,
  });
}

export async function dismissMoment(
  env: Bindings,
  viewerId: string,
  kind: string,
  scope: "once" | "kind" | "all" | "acknowledged",
) {
  const record = await readUsherRecord(env.DB, viewerId);

  if (scope === "all") {
    await writeUsherRecord(env.DB, viewerId, { status: "dismissed" });

    return;
  }

  if (scope === "kind") {
    await writeUsherRecord(env.DB, viewerId, {
      muted: { ...record.muted, [kind]: daysFromNow(30) },
      ignored: 0,
    });

    return;
  }

  if (scope === "acknowledged") {
    await writeUsherRecord(env.DB, viewerId, {
      ignored: 0,
      lastPromptedAt: new Date().toISOString(),
    });

    return;
  }

  const ignored = record.ignored + 1;

  await writeUsherRecord(env.DB, viewerId, {
    ignored: ignored >= IGNORE_LIMIT ? 0 : ignored,
    snoozedUntil: ignored >= IGNORE_LIMIT ? daysFromNow(QUIET_DAYS) : record.snoozedUntil,
    lastPromptedAt: new Date().toISOString(),
  });
}

export type ViewerPreferences = {
  providerIds: string[];
  genres: string[];
  frequency: string;
  motivation: string[];
  actors: string[];
  directors: string[];
  runtime: string;
  subtitles: string;
  novelty: string;
  preferredLanguage: string;
  mutedGenres: string[];
  adultConfirmed: boolean;
  offensiveContentApproved: boolean;
};

export const NO_PREFERENCES: ViewerPreferences = {
  providerIds: [],
  genres: [],
  frequency: "",
  motivation: [],
  actors: [],
  directors: [],
  runtime: "",
  subtitles: "",
  novelty: "",
  preferredLanguage: "en",
  mutedGenres: [],
  adultConfirmed: false,
  offensiveContentApproved: false,
};

export async function readViewerPreferences(
  db: Database,
  viewerId: string,
): Promise<ViewerPreferences> {
  if (!viewerId) {
    return NO_PREFERENCES;
  }

  try {
    const [answers, chosenProviderIds, notebook] = await Promise.all([
      readAnswers(db, viewerId),
      readProviderPreferences(db, viewerId),
      readNotebookPreferences(db, viewerId),
    ]);
    const single = (id: string) => {
      const value = answers.get(id);

      return typeof value === "string" ? value : "";
    };

    return {
      providerIds: validProviderIds(chosenProviderIds ?? answers.get("providers")),
      genres: stringList(answers.get("genres"), { limit: 8 }),
      frequency: single("frequency"),
      motivation: stringList(answers.get("motivation"), { limit: 4 }),
      actors: stringList(answers.get("actors"), { limit: MAX_PEOPLE }),
      directors: stringList(answers.get("directors"), { limit: MAX_PEOPLE }),
      runtime: single("runtime"),
      subtitles: single("subtitles"),
      novelty: single("novelty"),
      preferredLanguage: notebook.preferredLanguage,
      mutedGenres: notebook.mutedGenres,
      adultConfirmed: notebook.adultConfirmed,
      offensiveContentApproved: notebook.offensiveContentApproved,
    };
  } catch (error) {
    logError("usher_preferences_failed", error);

    return NO_PREFERENCES;
  }
}

const MOTIVATION_PHRASES: Record<string, string> = {
  "switch-off": "watches to switch off",
  "get-lost": "wants to get lost in a story",
  critics: "follows the reviews",
  cast: "follows the cast",
  "talked-about": "likes what people are talking about",
  background: "often has something on in the background",
  together: "usually watches with other people",
};

const RUNTIME_PHRASES: Record<string, string> = {
  short: "prefers things under a hundred minutes",
  long: "is happy with long running times",
};

const NOVELTY_PHRASES: Record<string, string> = {
  new: "always wants something new",
  rewatch: "happily rewatches favourites",
};

export function preferenceSummary(preferences: ViewerPreferences) {
  const parts: string[] = [];

  if (preferences.genres.length) {
    parts.push(`Reaches for ${preferences.genres.join(", ")}`);
  }

  const motivation = preferences.motivation
    .map((value) => MOTIVATION_PHRASES[value])
    .filter(Boolean);

  if (motivation.length) {
    parts.push(motivation.join(" and "));
  }

  const people = [...preferences.actors, ...preferences.directors];

  if (people.length) {
    parts.push(`Will watch anything with ${people.join(", ")}`);
  }

  const runtime = RUNTIME_PHRASES[preferences.runtime];

  if (runtime) {
    parts.push(runtime);
  }

  if (preferences.subtitles === "never") {
    parts.push("would rather not read subtitles");
  }

  const novelty = NOVELTY_PHRASES[preferences.novelty];

  if (novelty) {
    parts.push(novelty);
  }

  return parts.join(". ");
}

export function hasPreferences(preferences: ViewerPreferences) {
  return Boolean(
    preferences.genres.length ||
    preferences.motivation.length ||
    preferences.actors.length ||
    preferences.directors.length,
  );
}
