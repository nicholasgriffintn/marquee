import { curatedRailId } from "../../src/domain/rails.ts";
import { isDecisionId } from "../lib/decisions.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord, stringAt } from "../lib/values.ts";

export type StoredRail = {
  railId: string;
  angle: string;
  name: string;
  reason: string;
  titleIds: string[];
  decisionId?: string;
};

function legacyRailId(name: string) {
  return `ai-${name.toLowerCase().replaceAll(/\W+/gu, "-")}`;
}

export function feedbackIdsFor(rail: StoredRail) {
  return [rail.railId, legacyRailId(rail.name)];
}

export function storedRail(angle: string, name: string, reason: string, titleIds: string[]) {
  return { railId: curatedRailId(angle), angle, name, reason, titleIds } satisfies StoredRail;
}

export function toStoredRail(value: unknown): StoredRail | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = stringAt(value, "name")?.trim() ?? "";
  const angle = stringAt(value, "angle")?.trim() ?? "";
  const titleIds = Array.isArray(value.titleIds) ? value.titleIds.filter(isKnownTitle) : [];

  if (!name || titleIds.length === 0) {
    return null;
  }

  return {
    railId: stringAt(value, "railId") ?? (angle ? curatedRailId(angle) : legacyRailId(name)),
    angle,
    name,
    reason: stringAt(value, "reason") ?? "",
    titleIds,
    ...(isDecisionId(value.decisionId) ? { decisionId: value.decisionId } : {}),
  };
}

export function toStoredRails(value: unknown): StoredRail[] {
  return Array.isArray(value) ? value.flatMap((entry) => toStoredRail(entry) ?? []) : [];
}
