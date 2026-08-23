import type { MediaTitle } from "../../src/domain/catalog.ts";
import { showingFor, type Showing } from "../../src/domain/usher.ts";
import { USHER_VOICE } from "../ai/usher-voice.ts";
import { fastModel, requestAiCompletion } from "../clients/ai-gateway.ts";
import type { ChatMessage } from "../lib/curator-payload.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord } from "../lib/values.ts";
import { searchCatalogue } from "../repositories/catalog-search.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { retrieveTitles } from "./retrieval.ts";
import { tasteVector } from "./taste.ts";
import { preferenceSummary, readViewerPreferences } from "./usher.ts";

const SHORTLIST = 8;
const NEIGHBOUR_TOP_K = 80;

const PICK_PROMPT = [
  USHER_VOICE,
  "You are picking exactly one thing for this viewer to watch tonight. Commit to it.",
  "Give one sentence on why, in your own voice. Name something concrete about the title, not a genre label.",
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
  const preferences = await readViewerPreferences(env.DB, viewerId);
  const services = [...new Set([...(options.providerIds ?? []), ...preferences.providerIds])];
  const viewer = await readViewerContext(env.DB, viewerId, services);
  const exclude = [
    ...(options.rejected ?? []),
    ...viewer.entries
      .filter((entry) => entry.status === "watched" || entry.status === "dropped")
      .map((entry) => entry.titleId),
  ];
  const loose = {
    providerIds: services,
    excludeIds: exclude,
    limit: constraints.limit ?? SHORTLIST,
    minVotes: 200,
    ...(constraints.maxRuntime ? { maxRuntime: constraints.maxRuntime } : {}),
    ...(constraints.mediaType ? { mediaType: constraints.mediaType } : {}),
  };
  const base = {
    ...loose,
    ...(constraints.genres?.length ? { genres: constraints.genres.slice(0, 6) } : {}),
  };
  const vector = await tasteVector(env, viewer, preferences);

  if (vector) {
    try {
      const matches = await env.VECTORS.query(vector, {
        topK: NEIGHBOUR_TOP_K,
        returnMetadata: "none",
      });
      const ids = matches.matches.map((match) => match.id);

      if (ids.length) {
        const titles = await searchCatalogue(env.DB, { ...base, includeIds: ids });

        if (titles.length) {
          return { titles, preferences };
        }
      }
    } catch (error) {
      logError("usher_pick_neighbours_failed", error);
    }
  }

  const wanted = constraints.genres?.length ? constraints.genres : preferences.genres.slice(0, 4);

  if (wanted.length) {
    const titles = await searchCatalogue(env.DB, {
      ...base,
      genres: wanted.slice(0, 6),
      sort: "score",
    });

    if (titles.length) {
      return { titles, preferences };
    }
  }

  return {
    titles: await retrieveTitles(env, {
      ...loose,
      text: constraints.text || "a film worth putting on tonight without thinking about it",
    }),
    preferences,
  };
}

export async function pickOne(
  env: Bindings,
  viewerId: string,
  options: { providerIds?: string[]; rejected?: string[]; hour?: number; isWeekend?: boolean } = {},
) {
  const providerIds = options.providerIds ?? [];
  const rejected = (options.rejected ?? []).filter(isKnownTitle).slice(0, 40);
  const showing = showingFor(options.hour ?? 20, options.isWeekend ?? false);
  const { titles, preferences } = await shortlistFor(env, viewerId, {
    providerIds,
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
  const summary = preferenceSummary(preferences);
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
      ].join("\n"),
    },
  ];

  try {
    const response = await requestAiCompletion(env, messages, [], false, {
      model: fastModel(env),
      timeoutMs: 15_000,
      maxTokens: 160,
      json: true,
      metadata: { feature: "usher_pick", viewer: viewerId },
    });
    const json = response.content?.match(/\{[\s\S]*\}/u)?.[0];
    const parsed: unknown = json ? JSON.parse(json) : null;

    if (isRecord(parsed) && isKnownTitle(parsed.titleId)) {
      const chosen = titles.find((title) => title.id === parsed.titleId);

      if (chosen) {
        const line = typeof parsed.line === "string" ? parsed.line.trim().slice(0, 160) : "";

        return { item: chosen, line: line || fallbackLine(chosen, showing) };
      }
    }
  } catch (error) {
    logError("usher_pick_failed", error);
  }

  const [chosen] = titles;

  return { item: chosen, line: fallbackLine(chosen, showing) };
}
