import { journeyFor } from "./journey";
import { jsonMutation, mutateJson } from "./query-client";

export type RefusalScope = "never";

export function recordRefusal(
  titleId: string,
  source: string,
  context: Record<string, unknown> = {},
) {
  const journey = journeyFor(titleId);

  return mutateJson(
    "/api/usher/reject",
    jsonMutation("POST", {
      titleId,
      source,
      ...(journey ? { journey: journey.token, rank: journey.rank } : {}),
      ...context,
    }),
  ).catch(() => undefined);
}
