import { Hono } from "hono";

import { bearerUser } from "../auth/api-tokens.ts";
import type { MarqueeUser } from "../auth/model.ts";
import { readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord } from "../lib/values.ts";
import { readFollowedPeople, setPersonFollow } from "../repositories/beliefs.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { readRanked } from "../repositories/catalog-search.ts";
import { readPerson, readPersonTitleIds } from "../repositories/people.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import { getTonight } from "../services/catalog.ts";
import { similarTo } from "../services/embeddings.ts";
import { readWeekAhead } from "../services/feeds.ts";
import { updateProfile } from "../services/profile.ts";
import { retrieveTitles } from "../services/retrieval.ts";
import { getTitleInsight } from "../services/title-insight.ts";
import type { Bindings } from "../types.ts";

export const mcpRoutes = new Hono<{ Bindings: Bindings }>();

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "marquee", version: "1.0.0" };
const TONIGHT_EPISODES = 20;

const TOOLS = [
  {
    name: "search_catalogue",
    description:
      "Search Marquee's film and television catalogue. The query understands moods and descriptions as well as words in a title, so 'slow burn on a rainy night' works as well as a genre.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What you are looking for." },
        mediaType: { type: "string", enum: ["movie", "tv"] },
        genres: { type: "array", items: { type: "string" } },
        minScore: { type: "number", minimum: 0, maximum: 10 },
        releasedAfter: { type: "integer", minimum: 1900, maximum: 2100 },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      required: ["query"],
    },
  },
  {
    name: "find_similar",
    description: "Find catalogue titles that feel like a given title.",
    inputSchema: {
      type: "object",
      properties: {
        titleId: {
          type: "string",
          description: "A Marquee id such as movie:550.",
        },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      required: ["titleId"],
    },
  },
  {
    name: "get_title",
    description: "Read the full record for a title, including where it is streaming.",
    inputSchema: {
      type: "object",
      properties: { titleId: { type: "string" } },
      required: ["titleId"],
    },
  },
  {
    name: "get_shelf",
    description: "Read everything on the viewer's shelf with statuses, ratings and notes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_to_shelf",
    description: "Add or update a title on the viewer's shelf.",
    inputSchema: {
      type: "object",
      properties: {
        titleId: { type: "string" },
        status: {
          type: "string",
          enum: ["watchlist", "watching", "watched", "dropped"],
        },
        rating: { type: "integer", minimum: 1, maximum: 5 },
        thoughts: { type: "string" },
      },
      required: ["titleId", "status"],
    },
  },
  {
    name: "whats_on_tonight",
    description: "Episodes landing in the next day and a half, from the viewer's own shows first.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whats_on_this_week",
    description:
      "Dated things from the viewer's own shelf: episodes with times where the schedule has them, announced episode dates beyond that, and releases of unwatched watchlist titles. Anything already watched is left out.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "How far ahead to look, 1 to 60. Defaults to 7.",
        },
      },
    },
  },
  {
    name: "titles_by_person",
    description: "Everything in the catalogue credited to a person, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A credited name, e.g. Tilda Swinton",
        },
        limit: { type: "number" },
      },
      required: ["name"],
    },
  },
  {
    name: "follow_person",
    description:
      "Follow or unfollow a credited name. Followed names are alerted on when something new of theirs appears.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        follow: { type: "boolean", description: "Defaults to true." },
      },
      required: ["name"],
    },
  },
];

function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function compact(items: Awaited<ReturnType<typeof readItems>>) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    year: item.year,
    mediaType: item.mediaType,
    genres: item.genres,
    keywords: (item.keywords ?? []).slice(0, 8),
    tmdbScore: item.tmdbScore,
    runtimeMinutes: item.runtimeMinutes,
    overview: item.overview.slice(0, 300),
    streamingOn: item.providers.map((provider) => provider.name),
  }));
}

async function callTool(
  env: Bindings,
  user: MarqueeUser,
  name: string,
  input: Record<string, unknown>,
  origin: string,
) {
  if (name === "search_catalogue") {
    const { success } = await env.SEARCH_MEMBER_RATE_LIMITER.limit({
      key: user.id,
    });

    if (!success) {
      return textResult({ error: "Too many searches. Wait a minute." }, true);
    }

    const results = await retrieveTitles(env, {
      text: typeof input.query === "string" ? input.query.slice(0, 300) : "",
      mediaType:
        input.mediaType === "movie" || input.mediaType === "tv" ? input.mediaType : undefined,
      genres: Array.isArray(input.genres)
        ? input.genres.filter((genre): genre is string => typeof genre === "string")
        : undefined,
      minScore: typeof input.minScore === "number" ? input.minScore : undefined,
      releasedAfter: typeof input.releasedAfter === "number" ? input.releasedAfter : undefined,
      providerIds: [],
      limit: typeof input.limit === "number" ? Math.min(25, input.limit) : 10,
    });

    return textResult({ results: compact(results) });
  }

  if (name === "find_similar") {
    if (!isKnownTitle(input.titleId)) {
      return textResult({ error: "titleId must look like movie:550" }, true);
    }

    const limit = typeof input.limit === "number" ? Math.min(25, input.limit) : 10;
    const neighbours = (await similarTo(env, input.titleId, limit + 1)).slice(0, limit);

    return textResult({
      results: compact(await readRanked(env.DB, neighbours)),
    });
  }

  if (name === "get_title") {
    if (!isKnownTitle(input.titleId)) {
      return textResult({ error: "titleId must look like movie:550" }, true);
    }

    const [title] = await readItems(env.DB, [input.titleId]);

    if (!title) {
      return textResult({ error: "Unknown title" }, true);
    }

    const { success: canGenerate } = await env.CURATOR_RATE_LIMITER.limit({
      key: user.id,
    });
    const insight = await getTitleInsight(env, title.id, {
      generate: canGenerate,
    }).catch(() => null);

    return textResult({
      ...compact([title])[0],
      certification: title.certification,
      ratings: title.ratings ?? null,
      watchLink: title.watchLink,
      hook: insight?.hook ?? null,
      moods: insight?.moods ?? [],
    });
  }

  if (name === "get_shelf") {
    const viewer = await readViewerContext(env.DB, user.id);
    const titles = await readItems(
      env.DB,
      viewer.entries.map((entry) => entry.titleId),
      100,
    );
    const byId = new Map(titles.map((title) => [title.id, title]));

    return textResult({
      entries: viewer.entries.map((entry) => ({
        id: entry.titleId,
        title: byId.get(entry.titleId)?.title ?? entry.titleId,
        year: byId.get(entry.titleId)?.year ?? null,
        status: entry.status,
        rating: entry.rating,
        thoughts: entry.thoughts,
      })),
    });
  }

  if (name === "save_to_shelf") {
    const result = await updateProfile(env.DB, user.id, input);

    return result.ok ? textResult({ saved: true }) : textResult({ error: result.error }, true);
  }

  if (name === "whats_on_tonight") {
    const tonight = await getTonight(env, user.id, origin, TONIGHT_EPISODES);

    return textResult({
      episodes: tonight.episodes.map((episode) => ({
        titleId: episode.titleId,
        show: episode.showName,
        season: episode.season,
        episode: episode.episode,
        name: episode.episodeName,
        airsAt: episode.airsAt,
        network: episode.network,
      })),
    });
  }

  if (name === "whats_on_this_week") {
    const days = typeof input.days === "number" ? clamp(Math.round(input.days), 1, 60) : 7;

    return textResult({
      days,
      entries: await readWeekAhead(env, user.id, days),
    });
  }

  if (name === "titles_by_person") {
    const wanted = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
    const person = wanted ? await readPerson(env.DB, wanted) : null;

    if (!person) {
      return textResult({ error: "No one in the catalogue by that name" }, true);
    }

    const limit = typeof input.limit === "number" ? Math.min(48, input.limit) : 20;
    const ids = await readPersonTitleIds(env.DB, person.personId, limit);

    return textResult({
      person: person.name,
      credits: person.titles,
      results: compact(await readItems(env.DB, ids, limit)),
    });
  }

  if (name === "follow_person") {
    const wanted = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";

    if (wanted.length < 2) {
      return textResult({ error: "Give a name to follow" }, true);
    }

    await setPersonFollow(env.DB, user.id, wanted, input.follow !== false);

    return textResult({ following: await readFollowedPeople(env.DB, user.id) });
  }

  return textResult({ error: `Unknown tool ${name}` }, true);
}

mcpRoutes.all("/", async (context) => {
  if (context.req.method !== "POST") {
    return context.json({ error: "Use POST with JSON-RPC" }, 405, {
      allow: "POST",
    });
  }

  const user = await bearerUser(context.env, context.req.raw);

  if (!user) {
    return context.json({ error: "A Marquee API token is required" }, 401, {
      "www-authenticate": 'Bearer realm="marquee"',
    });
  }

  const body = await readJsonObject(context.req.raw);

  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return context.json(fail(null, -32_600, "Invalid JSON-RPC request"), 400);
  }

  const { id, method } = body;

  if (method.startsWith("notifications/")) {
    return context.body(null, 202);
  }

  if (method === "initialize") {
    return context.json(
      ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      }),
    );
  }

  if (method === "ping") {
    return context.json(ok(id, {}));
  }

  if (method === "tools/list") {
    return context.json(ok(id, { tools: TOOLS }));
  }

  if (method === "tools/call") {
    const parameters = isRecord(body.params) ? body.params : {};
    const name = typeof parameters.name === "string" ? parameters.name : "";
    const input = isRecord(parameters.arguments) ? parameters.arguments : {};

    try {
      return context.json(
        ok(
          id,
          await callTool(
            context.env,
            user,
            name,
            input,
            canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
          ),
        ),
      );
    } catch (error) {
      logError("mcp_tool_failed", error, { tool: name });

      return context.json(ok(id, textResult({ error: "The tool failed" }, true)));
    }
  }

  return context.json(fail(id, -32_601, `Unknown method ${method}`), 404);
});
