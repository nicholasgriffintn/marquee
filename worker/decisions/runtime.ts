import type { Bindings } from "../types.ts";
import { JevDecisionModel } from "./jev.ts";
import type { DecisionModel } from "./model.ts";

export function configuredDecisionModel(env: Bindings): DecisionModel | null {
  const apiKey = env.TYPESAFE_API_KEY?.trim();

  return apiKey ? new JevDecisionModel({ apiKey }) : null;
}
