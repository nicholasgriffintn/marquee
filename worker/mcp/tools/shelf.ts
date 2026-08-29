import { ENTRY_STATUSES, isEntryStatus } from "../../../src/domain/entries.ts";
import { isKnownTitle } from "../../lib/validation.ts";
import { readItems } from "../../repositories/catalog-reader.ts";
import { readViewerEntries } from "../../repositories/viewer-context.ts";
import { getViewingEntry, updateProfile } from "../../services/profile.ts";
import {
  answer,
  awaitingApproval,
  CONFIRM_PROPERTY,
  type McpTool,
  READS,
  refuse,
} from "../registry.ts";

const SHELF_PAGE = 100;

const SHELF_ENTRY_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    year: { type: ["integer", "null"] },
    status: { type: "string", enum: [...ENTRY_STATUSES] },
    rating: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    thoughts: { type: "string" },
  },
  required: ["id", "title", "status"],
};

export const shelfTools: readonly McpTool[] = [
  {
    name: "get_shelf",
    title: "Read the shelf",
    description: "Read everything on the viewer's shelf with statuses, ratings and notes.",
    scope: "shelf:read",
    annotations: READS,
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: { entries: { type: "array", items: SHELF_ENTRY_SCHEMA } },
      required: ["entries"],
    },
    async run({ env, user }) {
      const entries = await readViewerEntries(env.DB, user.id);
      const titles = await readItems(
        env.DB,
        entries.map((entry) => entry.titleId),
        SHELF_PAGE,
      );
      const byId = new Map(titles.map((title) => [title.id, title]));

      return answer({
        entries: entries.map((entry) => ({
          id: entry.titleId,
          title: byId.get(entry.titleId)?.title ?? entry.titleId,
          year: byId.get(entry.titleId)?.year ?? null,
          status: entry.status,
          rating: entry.rating,
          thoughts: entry.thoughts,
        })),
      });
    },
  },
  {
    name: "save_to_shelf",
    title: "Change the shelf",
    description:
      "Add or update a title on the viewer's shelf. Called without confirm it writes nothing and returns what the change would be, so it can be approved before it lands.",
    scope: "shelf:write",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        titleId: {
          type: "string",
          description: "A Marquee id such as movie:550.",
        },
        status: { type: "string", enum: [...ENTRY_STATUSES] },
        rating: { type: "integer", minimum: 1, maximum: 5 },
        thoughts: { type: "string" },
        confirm: CONFIRM_PROPERTY,
      },
      required: ["titleId", "status"],
    },
    outputSchema: {
      type: "object",
      properties: {
        applied: { type: "boolean" },
        approvalRequired: { type: "boolean" },
        change: {
          type: "object",
          properties: {
            titleId: { type: "string" },
            title: { type: "string" },
            from: { type: ["object", "null"] },
            to: { type: "object" },
          },
          required: ["titleId", "to"],
        },
      },
      required: ["applied"],
    },
    async run({ env, user }, input) {
      if (!isKnownTitle(input.titleId)) {
        return refuse("titleId must look like movie:550");
      }

      if (!isEntryStatus(input.status)) {
        return refuse(`status must be one of ${ENTRY_STATUSES.join(", ")}`);
      }

      if (input.confirm !== true) {
        const [title] = await readItems(env.DB, [input.titleId]);
        const existing = await getViewingEntry(env.DB, user.id, input.titleId);

        return awaitingApproval({
          titleId: input.titleId,
          title: title?.title ?? input.titleId,
          from: existing
            ? {
                status: existing.status,
                rating: existing.rating,
                thoughts: existing.thoughts,
              }
            : null,
          to: {
            status: input.status,
            rating: input.rating ?? null,
            thoughts: input.thoughts ?? "",
          },
        });
      }

      const result = await updateProfile(env.DB, user.id, input);

      return result.ok ? answer({ applied: true }) : refuse(result.error);
    },
  },
];
