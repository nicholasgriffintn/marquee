import { accessFor } from "../../../src/domain/access.ts";
import { barredCertifications } from "../../../src/domain/certification.ts";
import { validProviderIds } from "../../lib/validation.ts";
import { readRefusals } from "../../repositories/signals.ts";
import { readViewerEntries } from "../../repositories/viewer-context.ts";
import type { Bindings, ViewingContext } from "../../types.ts";
import { NO_PREFERENCES, readViewerPreferences, type ViewerPreferences } from "../usher.ts";
import type { AvailabilityRule, Eligibility } from "./eligibility.ts";

export type ViewerState = {
  viewerId: string;
  entries: ViewingContext[];
  providerIds: string[];
  preferences: ViewerPreferences;
  never: string[];
  rejected: string[];
  finished: string[];
};

export type EligibilityOptions = {
  availability?: AvailabilityRule;
  exclude?: string[];
  excludeGenres?: string[];
  certifications?: string[];
  maxRuntime?: number | null;
  mediaType?: "movie" | "tv";
};

const NO_STATE: Omit<ViewerState, "viewerId" | "providerIds"> = {
  entries: [],
  preferences: NO_PREFERENCES,
  never: [],
  rejected: [],
  finished: [],
};

function finishedIds(entries: ViewingContext[]) {
  return entries
    .filter((entry) => entry.status === "watched" || entry.status === "dropped")
    .map((entry) => entry.titleId);
}

export async function readViewerState(
  env: Bindings,
  viewerId: string,
  options: { providerIds?: string[] } = {},
): Promise<ViewerState> {
  const requested = validProviderIds(options.providerIds ?? []);

  if (!viewerId) {
    return { ...NO_STATE, viewerId, providerIds: requested };
  }

  const [entries, preferences, refusals] = await Promise.all([
    readViewerEntries(env.DB, viewerId),
    readViewerPreferences(env.DB, viewerId),
    readRefusals(env.DB, viewerId),
  ]);

  return {
    viewerId,
    entries,
    providerIds: validProviderIds([...requested, ...preferences.providerIds]),
    preferences,
    never: refusals.never,
    rejected: refusals.rejected,
    finished: finishedIds(entries),
  };
}

export function eligibilityFor(state: ViewerState, options: EligibilityOptions = {}): Eligibility {
  return {
    providerIds: state.providerIds,
    availability: options.availability ?? "confirmed",
    excludeIds: [
      ...new Set([
        ...state.never,
        ...state.rejected,
        ...state.finished,
        ...(options.exclude ?? []),
      ]),
    ],
    excludeGenres: [
      ...new Set([...state.preferences.mutedGenres, ...(options.excludeGenres ?? [])]),
    ],
    certifications: [
      ...new Set([
        ...barredCertifications(accessFor(Boolean(state.viewerId), state.preferences)),
        ...(options.certifications ?? []),
      ]),
    ],
    languages: [state.preferences.preferredLanguage],
    ...(options.maxRuntime ? { maxRuntime: options.maxRuntime } : {}),
    ...(options.mediaType ? { mediaType: options.mediaType } : {}),
  };
}
