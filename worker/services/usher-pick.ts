import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { Belief } from "../../src/domain/notebook.ts";
import { showingFor, type Showing } from "../../src/domain/usher.ts";
import { runAiObject } from "../ai/run.ts";
import { USHER_VOICE } from "../ai/usher-voice.ts";
import type { ChatMessage } from "../lib/curator-payload.ts";
import { candidatesFrom, promptVersion } from "../lib/decisions.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord } from "../lib/values.ts";
import { readBeliefs } from "../repositories/beliefs.ts";
import { searchCatalogue, type CatalogueSearch } from "../repositories/catalog-search.ts";
import { readShelfDetail } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { beliefSummary } from "./beliefs.ts";
import { beginDecision, settleThrough, type DeferTask } from "./decisions.ts";
import { nearestTo } from "./embeddings.ts";
import {
  eligibleTitles,
  poolFor,
  rankTitles,
  retrieveTitles,
  type TitleSource,
} from "./retrieval/index.ts";
import { tasteVector } from "./taste.ts";
import { preferenceSummary } from "./usher.ts";
import { eligibilityFor, readViewerState } from "./viewer/state.ts";
import { factBrief, factsFor, serviceFor } from "./why.ts";

const SHORTLIST = 8;

const PICK_PROMPT = [
  USHER_VOICE,
  "You are picking exactly one thing for this viewer to watch tonight. Commit to it.",
  "Give one sentence on why, in your own voice. Use only the facts you are given; never invent a comparison, a runtime or a service.",
  'Reply with JSON only: {"titleId":"","line":""}.',
].join(" ");

export const PICK_PROMPT_VERSION = promptVersion(PICK_PROMPT);

function fallbackLine(title: MediaTitle, showing: Showing) {
  if (showing.slot === "late" || showing.slot === "small-hours") {
    return "It's late. This one won't keep you up.";
  }

  if (title.runtimeMinutes && title.runtimeMinutes > 150) {
    return "It's long. Clear the evening.";
  }

  if (title.mediaType === "tv") {
    return "Start it tonight. See how you feel after one.";
  }

  return "This one. No committee needed.";
}

export type ShortlistConstraints = {
  maxRuntime?: number | null;
  mediaType?: "movie" | "tv";
  genres?: string[];
  bannedGenres?: string[];
  certifications?: string[];
  text?: string;
  limit?: number;
};

export async function shortlistFor(
  env: Bindings,
  viewerId: string,
  options: {
    providerIds?: string[];
    rejected?: string[];
    constraints?: ShortlistConstraints;
    beliefs?: Promise<Belief[]>;
  } = {},
) {
  const constraints = options.constraints ?? {};
  const [viewer, beliefs] = await Promise.all([
    readViewerState(env, viewerId, { providerIds: options.providerIds }),
    options.beliefs ?? readBeliefs(env.DB, viewerId),
  ]);
  const preferences = viewer.preferences;
  const eligibility = eligibilityFor(viewer, {
    exclude: options.rejected ?? [],
    ...(constraints.bannedGenres ? { excludeGenres: constraints.bannedGenres } : {}),
    ...(constraints.certifications?.length ? { certifications: constraints.certifications } : {}),
    ...(constraints.maxRuntime ? { maxRuntime: constraints.maxRuntime } : {}),
    ...(constraints.mediaType ? { mediaType: constraints.mediaType } : {}),
  });
  const loose = {
    ...eligibility,
    limit: constraints.limit ?? SHORTLIST,
    minVotes: 200,
  };
  const base: CatalogueSearch = {
    ...loose,
    ...(constraints.genres?.length ? { genres: constraints.genres.slice(0, 6) } : {}),
  };
  const limit = constraints.limit ?? SHORTLIST;
  const pool = poolFor(limit);
  const vector = await tasteVector(env, viewer.entries, preferences, {
    never: viewer.never,
    summary: beliefSummary(beliefs) || preferenceSummary(preferences),
  });
  const sources: TitleSource[] = [];

  if (vector) {
    try {
      const matches = await nearestTo(env, vector, base);
      const titles = await eligibleTitles(
        env,
        matches.map((match) => match.id),
        base,
        pool,
      );

      if (titles.length) {
        sources.push({ source: "semantic", titles });
      }
    } catch (error) {
      logError("usher_pick_neighbours_failed", error);
    }
  }

  const wanted = constraints.genres?.length ? constraints.genres : preferences.genres.slice(0, 4);

  if (sources.length === 0 && wanted.length) {
    const titles = await searchCatalogue(env.DB, {
      ...base,
      genres: wanted.slice(0, 6),
      sort: "score",
      limit: pool,
    });

    if (titles.length) {
      sources.push({ source: "genre", titles });
    }
  }

  if (sources.length === 0) {
    const titles = await retrieveTitles(env, {
      ...loose,
      text: constraints.text || "a film worth putting on tonight without thinking about it",
    });

    return {
      titles,
      viewer,
      candidates: candidatesFrom(titles, { origin: "retrieval" }),
    };
  }

  const ranked = rankTitles(sources, { limit });
  const titles = ranked.map((candidate) => candidate.title);

  return {
    titles,
    viewer,
    candidates: candidatesFrom(titles, {
      scores: new Map(ranked.map((candidate) => [candidate.title.id, candidate.score])),
      origin: "ranked",
    }),
  };
}

export async function pickOne(
  env: Bindings,
  viewerId: string,
  options: {
    providerIds?: string[];
    rejected?: string[];
    hour?: number;
    isWeekend?: boolean;
    defer?: DeferTask;
  } = {},
) {
  const rejected = (options.rejected ?? []).filter(isKnownTitle).slice(0, 40);
  const showing = showingFor(options.hour ?? 20, options.isWeekend ?? false);
  const beliefs = readBeliefs(env.DB, viewerId);
  const shelfDetail = readShelfDetail(env.DB, viewerId, 20).catch((): never[] => []);
  const { titles, viewer, candidates } = await shortlistFor(env, viewerId, {
    ...(options.providerIds ? { providerIds: options.providerIds } : {}),
    rejected,
    constraints: { maxRuntime: showing.maxRuntime },
    beliefs,
  });
  const decision = beginDecision(env, {
    feature: "usher_pick",
    promptVersion: PICK_PROMPT_VERSION,
    viewerId,
    surface: showing.slot,
  });

  decision.candidates(candidates);

  if (titles.length === 0) {
    await settleThrough(decision, "empty", options.defer);

    return null;
  }

  const listing = titles
    .map(
      (title) =>
        `${title.id} · ${title.title}${title.year ? ` (${title.year})` : ""} · ${
          title.mediaType === "movie" ? "film" : "series"
        }${title.runtimeMinutes ? `, ${title.runtimeMinutes} min` : ""} · ${title.genres
          .slice(0, 3)
          .join(", ")} · ${title.overview.slice(0, 240)}`,
    )
    .join("\n");
  const summary = preferenceSummary(viewer.preferences);
  const [shelf, viewerBeliefs] = await Promise.all([shelfDetail, beliefs]);
  const factsById = new Map(
    titles.map((title) => [
      title.id,
      factsFor(title, {
        service: serviceFor(title, viewer.providerIds),
        shelf,
        beliefs: viewerBeliefs,
      }),
    ]),
  );
  const messages: ChatMessage[] = [
    { role: "system", content: PICK_PROMPT },
    {
      role: "user",
      content: [
        showing.brief,
        "",
        summary ? `What I know about them: ${summary}` : "I know very little about them yet.",
        "",
        `Tonight's options:\n${listing}`,
        "",
        titles
          .map((title) => `${title.id} — ${factBrief(factsById.get(title.id) ?? [])}`)
          .join("\n"),
      ].join("\n"),
    },
  ];

  try {
    const parsed = await runAiObject(env, {
      feature: "usher_pick",
      decisionId: decision.id,
      viewerId,
      messages,
      record: decision,
    });

    if (isRecord(parsed) && isKnownTitle(parsed.titleId)) {
      const chosen = titles.find((title) => title.id === parsed.titleId);

      if (chosen) {
        const line = typeof parsed.line === "string" ? parsed.line.trim().slice(0, 160) : "";

        decision.select([chosen.id]);
        await settleThrough(decision, "served", options.defer);

        return {
          item: chosen,
          line: line || fallbackLine(chosen, showing),
          facts: factsById.get(chosen.id) ?? [],
          decisionId: decision.id,
        };
      }
    }
  } catch (error) {
    logError("usher_pick_failed", error);
  }

  const [chosen] = titles;

  decision.select([chosen.id]);
  await settleThrough(decision, "served", options.defer);

  return {
    item: chosen,
    line: fallbackLine(chosen, showing),
    facts: factsById.get(chosen.id) ?? [],
    decisionId: decision.id,
  };
}
