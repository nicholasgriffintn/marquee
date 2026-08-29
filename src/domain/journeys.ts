export const JOURNEY_MODES = [
  "rail",
  "catalogue",
  "ai-rail",
  "search",
  "usher-pick",
  "usher-order",
] as const;

export type JourneyMode = (typeof JOURNEY_MODES)[number];

export const JOURNEY_TTL_MS = 30 * 60_000;

export const JOURNEY_ANGLE_LIMIT = 60;

export const JOURNEY_SIZE_LIMIT = 500;

export function isJourneyMode(value: unknown): value is JourneyMode {
  return typeof value === "string" && JOURNEY_MODES.includes(value as JourneyMode);
}
