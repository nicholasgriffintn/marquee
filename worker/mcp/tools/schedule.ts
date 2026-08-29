import { clamp } from "../../lib/numbers.ts";
import { getTonight } from "../../services/catalog.ts";
import { readWeekAhead } from "../../services/feeds.ts";
import { answer, type McpTool, READS } from "../registry.ts";

const TONIGHT_EPISODES = 20;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 60;

export const scheduleTools: readonly McpTool[] = [
  {
    name: "whats_on_tonight",
    title: "What is on tonight",
    description: "Episodes landing in the next day and a half, from the viewer's own shows first.",
    scope: "shelf:read",
    annotations: READS,
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        episodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titleId: { type: "string" },
              show: { type: "string" },
              season: { type: ["integer", "null"] },
              episode: { type: ["integer", "null"] },
              name: { type: ["string", "null"] },
              airsAt: { type: "string" },
              network: { type: ["string", "null"] },
            },
            required: ["titleId", "show", "airsAt"],
          },
        },
      },
      required: ["episodes"],
    },
    async run({ env, user, origin }) {
      const tonight = await getTonight(env, user.id, origin, TONIGHT_EPISODES);

      return answer({
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
    },
  },
  {
    name: "whats_on_this_week",
    title: "The week ahead",
    description:
      "Dated things from the viewer's own shelf: episodes with times where the schedule has them, announced episode dates beyond that, and releases of unwatched watchlist titles. Anything already watched is left out.",
    scope: "shelf:read",
    annotations: READS,
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: MAX_DAYS,
          description: `How far ahead to look. Defaults to ${DEFAULT_DAYS}.`,
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        days: { type: "integer" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["episode", "release"] },
              titleId: { type: "string" },
              title: { type: "string" },
              season: { type: ["integer", "null"] },
              episode: { type: ["integer", "null"] },
              name: { type: ["string", "null"] },
              when: { type: "string" },
              precision: { type: "string", enum: ["time", "day"] },
              network: { type: ["string", "null"] },
            },
            required: ["kind", "titleId", "title", "when", "precision"],
          },
        },
      },
      required: ["days", "entries"],
    },
    async run({ env, user }, input) {
      const days =
        typeof input.days === "number" ? clamp(Math.round(input.days), 1, MAX_DAYS) : DEFAULT_DAYS;

      return answer({ days, entries: await readWeekAhead(env, user.id, days) });
    },
  },
];
