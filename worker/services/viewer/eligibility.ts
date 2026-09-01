import type { MediaTitle } from "../../../src/domain/catalog.ts";
import { titleHasPreferredAudioLanguage } from "../../../src/domain/languages.ts";
import { includesProvider } from "../../lib/providers.ts";

export type AvailabilityRule = "confirmed" | "confirmed-or-unknown";

export type TitleAvailability = "confirmed" | "elsewhere" | "unknown";

export type Eligibility = {
  providerIds: string[];
  availability: AvailabilityRule;
  excludeIds: string[];
  excludeGenres: string[];
  certifications: string[];
  languages: string[];
  maxRuntime?: number;
  mediaType?: "movie" | "tv";
};

export function titleAvailability(title: MediaTitle, providerIds: string[]): TitleAvailability {
  if (providerIds.length === 0) {
    return "confirmed";
  }

  if (title.providers.length === 0) {
    return "unknown";
  }

  return includesProvider(title, providerIds) ? "confirmed" : "elsewhere";
}

export function meetsAvailability(
  title: MediaTitle,
  providerIds: string[],
  availability: AvailabilityRule,
) {
  const state = titleAvailability(title, providerIds);

  return state === "confirmed" || (state === "unknown" && availability === "confirmed-or-unknown");
}

function matchesCertification(certification: string, barred: string[]) {
  return barred.some((value) => certification === value || certification.endsWith(` ${value}`));
}

export function eligibilityGate(eligibility: Eligibility) {
  const excluded = new Set(eligibility.excludeIds);
  const banned = new Set(eligibility.excludeGenres.map((genre) => genre.toLowerCase()));
  const languages = new Set(eligibility.languages);

  return (title: MediaTitle) => {
    if (excluded.has(title.id)) {
      return false;
    }

    if (!meetsAvailability(title, eligibility.providerIds, eligibility.availability)) {
      return false;
    }

    if (
      languages.size > 0 &&
      !titleHasPreferredAudioLanguage(title, [...languages], eligibility.providerIds)
    ) {
      return false;
    }

    if (banned.size && title.genres.some((genre) => banned.has(genre.toLowerCase()))) {
      return false;
    }

    if (
      eligibility.certifications.length &&
      title.certification &&
      matchesCertification(title.certification, eligibility.certifications)
    ) {
      return false;
    }

    if (
      eligibility.maxRuntime &&
      (!title.runtimeMinutes || title.runtimeMinutes > eligibility.maxRuntime)
    ) {
      return false;
    }

    return !eligibility.mediaType || title.mediaType === eligibility.mediaType;
  };
}
