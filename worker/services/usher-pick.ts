import type { MediaTitle } from "../../src/domain/catalog.ts";
import { showingFor, type Showing } from "../../src/domain/usher.ts";
import { newDecisionId, runAiObject } from "../ai/run.ts";
import { USHER_VOICE } from "../ai/usher-voice.ts";
import type { ChatMessage } from "../lib/curator-payload.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord } from "../lib/values.ts";
import { readBeliefs } from "../repositories/beliefs.ts";
import { searchCatalogue, type CatalogueSearch } from "../repositories/catalog-search.ts";
import { readShelfDetail } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { viewerSummary } from "./beliefs.ts";
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
  } = {},
) {
  const constraints = options.constraints ?? {};
  const viewer = await readViewerState(env, viewerId, {
    providerIds: options.providerIds,
  });
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
    summary: await viewerSummary(env, viewerId, preferences),
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
    return {
      titles: await retrieveTitles(env, {
        ...loose,
        text: constraints.text || "a film worth putting on tonight without thinking about it",
      }),
      viewer,
    };
  }

  return {
    titles: rankTitles(sources, { limit }).map((candidate) => candidate.title),
    viewer,
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
  } = {},
) {
  const rejected = (options.rejected ?? []).filter(isKnownTitle).slice(0, 40);
  const showing = showingFor(options.hour ?? 20, options.isWeekend ?? false);
  const { titles, viewer } = await shortlistFor(env, viewerId, {
    ...(options.providerIds ? { providerIds: options.providerIds } : {}),
    rejected,
    constraints: { maxRuntime: showing.maxRuntime },
  });

  if (titles.length === 0) {
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
  const [shelf, beliefs] = await Promise.all([
    readShelfDetail(env.DB, viewerId, 20).catch((): never[] => []),
    readBeliefs(env.DB, viewerId),
  ]);
  const factsById = new Map(
    titles.map((title) => [
      title.id,
      factsFor(title, {
        service: serviceFor(title, viewer.providerIds),
        shelf,
        beliefs,
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
      decisionId: newDecisionId(),
      messages,
    });

    if (isRecord(parsed) && isKnownTitle(parsed.titleId)) {
      const chosen = titles.find((title) => title.id === parsed.titleId);

      if (chosen) {
        const line = typeof parsed.line === "string" ? parsed.line.trim().slice(0, 160) : "";

        return {
          item: chosen,
          line: line || fallbackLine(chosen, showing),
          facts: factsById.get(chosen.id) ?? [],
        };
      }
    }
  } catch (error) {
    logError("usher_pick_failed", error);
  }

  const [chosen] = titles;

  return {
    item: chosen,
    line: fallbackLine(chosen, showing),
    facts: factsById.get(chosen.id) ?? [],
  };
}
