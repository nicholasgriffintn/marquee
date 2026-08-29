import { readFollowedPeople, setPersonFollow } from "../../repositories/beliefs.ts";
import { readItems } from "../../repositories/catalog-reader.ts";
import { readPerson, readPersonTitleIds } from "../../repositories/people.ts";
import {
  answer,
  awaitingApproval,
  CONFIRM_PROPERTY,
  type McpTool,
  READS,
  refuse,
} from "../registry.ts";
import { summarise, TITLE_SUMMARY_SCHEMA } from "../summaries.ts";

const MAX_NAME_LENGTH = 120;
const MAX_CREDITS = 48;
const DEFAULT_CREDITS = 20;

function wantedName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_NAME_LENGTH) : "";
}

export const peopleTools: readonly McpTool[] = [
  {
    name: "titles_by_person",
    title: "Titles by a person",
    description: "Everything in the catalogue credited to a person, newest first.",
    scope: "catalogue:read",
    annotations: READS,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "A credited name, e.g. Tilda Swinton" },
        limit: { type: "integer", minimum: 1, maximum: MAX_CREDITS },
      },
      required: ["name"],
    },
    outputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        credits: { type: "integer" },
        results: { type: "array", items: TITLE_SUMMARY_SCHEMA },
      },
      required: ["person", "results"],
    },
    async run({ env }, input) {
      const wanted = wantedName(input.name);
      const person = wanted ? await readPerson(env.DB, wanted) : null;

      if (!person) {
        return refuse("No one in the catalogue by that name");
      }

      const limit =
        typeof input.limit === "number" && Number.isFinite(input.limit)
          ? Math.max(1, Math.min(MAX_CREDITS, Math.round(input.limit)))
          : DEFAULT_CREDITS;
      const ids = await readPersonTitleIds(env.DB, person.personId, limit);

      return answer({
        person: person.name,
        credits: person.titles,
        results: summarise(await readItems(env.DB, ids, limit)),
      });
    },
  },
  {
    name: "follow_person",
    title: "Follow a credited name",
    description:
      "Follow or unfollow a credited name. Followed names are alerted on when something new of theirs appears. Called without confirm it writes nothing and returns what the change would be, so it can be approved before it lands.",
    scope: "people:follow",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        follow: { type: "boolean", description: "True to follow, false to unfollow." },
        confirm: CONFIRM_PROPERTY,
      },
      required: ["name", "follow"],
    },
    outputSchema: {
      type: "object",
      properties: {
        applied: { type: "boolean" },
        approvalRequired: { type: "boolean" },
        change: {
          type: "object",
          properties: { name: { type: "string" }, follow: { type: "boolean" } },
          required: ["name", "follow"],
        },
        following: { type: "array", items: { type: "string" } },
      },
      required: ["applied"],
    },
    async run({ env, user }, input) {
      const wanted = wantedName(input.name);

      if (wanted.length < 2) {
        return refuse("Give a name to follow");
      }

      if (typeof input.follow !== "boolean") {
        return refuse("Say whether to follow or unfollow with follow: true or follow: false");
      }

      if (input.confirm !== true) {
        return awaitingApproval({ name: wanted, follow: input.follow });
      }

      await setPersonFollow(env.DB, user.id, wanted, input.follow);

      return answer({ applied: true, following: await readFollowedPeople(env.DB, user.id) });
    },
  },
];
