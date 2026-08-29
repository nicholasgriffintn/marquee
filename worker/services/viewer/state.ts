import { validProviderIds } from "../../lib/validation.ts";
import { readProviderPreferences } from "../../repositories/profile.ts";
import { readRefusals } from "../../repositories/signals.ts";
import { readViewerEntries } from "../../repositories/viewer-context.ts";
import type { Bindings, ViewingContext } from "../../types.ts";
import { NO_PREFERENCES, readViewerPreferences, type ViewerPreferences } from "../usher.ts";
import { ADULT_CERTIFICATIONS, type AvailabilityRule, type Eligibility } from "./eligibility.ts";

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
  allowAdult?: boolean;
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

  const [entries, preferences, saved, refusals] = await Promise.all([
    readViewerEntries(env.DB, viewerId),
    readViewerPreferences(env.DB, viewerId),
    readProviderPreferences(env.DB, viewerId),
    readRefusals(env.DB, viewerId),
  ]);

  return {
    viewerId,
    entries,
    providerIds: validProviderIds([...requested, ...(saved ?? preferences.providerIds)]),
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
    excludeGenres: [...new Set(options.excludeGenres ?? [])],
    excludeCertifications: options.allowAdult === false ? ADULT_CERTIFICATIONS : [],
    ...(options.maxRuntime ? { maxRuntime: options.maxRuntime } : {}),
    ...(options.mediaType ? { mediaType: options.mediaType } : {}),
  };
}
