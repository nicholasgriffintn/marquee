const FEATURES = [
  "curator",
  "insight",
  "note_hunches",
  "rails",
  "usher_order",
  "usher_pick",
] as const;

type AiGatewayFeature = (typeof FEATURES)[number];

const FEATURE_SET: ReadonlySet<string> = new Set(FEATURES);

export type AiGatewayMetadata =
  | { feature: "curator"; round?: number | "final" }
  | { feature: Exclude<AiGatewayFeature, "curator">; round?: never };

function safeFeature(value: unknown): AiGatewayFeature | null {
  return typeof value === "string" && FEATURE_SET.has(value) ? (value as AiGatewayFeature) : null;
}

function safeRound(value: unknown) {
  return value === "final" || (Number.isInteger(value) && Number(value) >= 0 && Number(value) < 4)
    ? value
    : undefined;
}

export function aiGatewayPrivacyHeaders(metadata?: AiGatewayMetadata) {
  const feature = safeFeature(metadata?.feature);
  const round = feature === "curator" ? safeRound(metadata?.round) : undefined;
  const safeMetadata = feature
    ? {
        feature,
        ...(round === undefined ? {} : { round }),
      }
    : null;

  return {
    "cf-aig-collect-log": "false",
    ...(safeMetadata ? { "cf-aig-metadata": JSON.stringify(safeMetadata) } : {}),
  };
}
