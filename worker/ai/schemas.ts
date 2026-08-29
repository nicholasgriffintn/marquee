export type OutputSchema = { name: string; schema: Record<string, unknown> };

const TITLE_ID = { type: "string", maxLength: 64 };

const LINE = { type: "string", maxLength: 200 };

function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const CURATOR_SCHEMA: OutputSchema = {
  name: "curator_selection",
  schema: object({
    titleIds: { type: "array", items: TITLE_ID, minItems: 1, maxItems: 8 },
    summary: { type: "string", maxLength: 400 },
    reasons: {
      type: "array",
      maxItems: 8,
      items: object({ titleId: TITLE_ID, reason: { type: "string", maxLength: 240 } }),
    },
  }),
};

export const RAIL_SCHEMA: OutputSchema = {
  name: "themed_shelf",
  schema: object({
    name: { type: "string", maxLength: 60 },
    reason: { type: "string", maxLength: 120 },
    titleIds: { type: "array", items: TITLE_ID, maxItems: 6 },
  }),
};

export const INSIGHT_SCHEMA: OutputSchema = {
  name: "title_insight",
  schema: object({
    hook: { type: "string", maxLength: 200 },
    moods: { type: "array", items: { type: "string", maxLength: 24 }, maxItems: 3 },
    pairs: {
      type: "array",
      maxItems: 3,
      items: object({
        pick: { type: "integer", minimum: 1 },
        reason: { type: "string", maxLength: 120 },
      }),
    },
  }),
};

export const NOTE_FACETS_SCHEMA: OutputSchema = {
  name: "note_facets",
  schema: object({
    facets: {
      type: "array",
      maxItems: 4,
      items: object({
        trait: { type: "string", maxLength: 40 },
        polarity: { type: "string", enum: ["seeks", "avoids"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        notes: { type: "array", maxItems: 12, items: { type: "integer", minimum: 1 } },
      }),
    },
  }),
};

export const USHER_PICK_SCHEMA: OutputSchema = {
  name: "usher_pick",
  schema: object({ titleId: TITLE_ID, line: LINE }),
};

export const USHER_ORDER_SCHEMA: OutputSchema = {
  name: "usher_order",
  schema: object({
    pick: object({ titleId: TITLE_ID, line: LINE }),
    backups: { type: "array", maxItems: 2, items: object({ titleId: TITLE_ID, line: LINE }) },
  }),
};
