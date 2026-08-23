export type BeliefScope = "always" | "tonight" | "week";

export type Belief = {
  id: string;
  key: string;
  value: string;
  strength: number;
  confidence: number;
  scope: BeliefScope;
  sourceRule: string;
  edited: boolean;
  suspendedUntil: string | null;
  evidence: number;
};

export type Notebook = {
  beliefs: Belief[];
  updatedAt: string;
};

export const BELIEF_SCOPES: BeliefScope[] = ["always", "tonight", "week"];

export function isBeliefScope(value: unknown): value is BeliefScope {
  return typeof value === "string" && BELIEF_SCOPES.includes(value as BeliefScope);
}

export function confidenceLabel(confidence: number) {
  if (confidence >= 0.85) {
    return "I know this";
  }

  if (confidence >= 0.6) {
    return "Fairly sure";
  }

  if (confidence >= 0.35) {
    return "It looks that way";
  }

  return "I may be imagining this";
}

export function strengthLabel(strength: number) {
  if (strength >= 0.75) {
    return "strongly";
  }

  if (strength >= 0.45) {
    return "clearly";
  }

  return "mildly";
}

export function beliefGroup(key: string) {
  return key.split(":")[0] ?? "other";
}

export const GROUP_TITLES: Record<string, string> = {
  genre: "What you reach for",
  avoid: "What you leave alone",
  person: "Faces you follow",
  runtime: "How long you sit still",
  mood: "Lately",
  hunch: "Hunches, which I may be wrong about",
  service: "Where you actually watch",
  habit: "How you watch",
};

export function isSuspended(belief: Belief, now = Date.now()) {
  return Boolean(belief.suspendedUntil && Date.parse(belief.suspendedUntil) > now);
}

export type Guest = {
  id: string;
  name: string;
  vetoes: string[];
  leanings: string[];
};
