import type { MediaTitle } from "../../../src/domain/catalog.ts";

export type AvailabilityRule = "confirmed" | "confirmed-or-unknown";

export type TitleAvailability = "confirmed" | "elsewhere" | "unknown";

export const ADULT_CERTIFICATIONS = [
  "r",
  "nc-17",
  "x",
  "tv-ma",
  "17+",
  "18",
  "18+",
  "r18+",
  "ma15+",
  "15",
  "16",
];

export function certificationRating(certification: string) {
  const space = certification.indexOf(" ");

  return (space >= 0 ? certification.slice(space + 1) : certification).trim().toLowerCase();
}

export type Eligibility = {
  providerIds: string[];
  availability: AvailabilityRule;
  excludeIds: string[];
  excludeGenres: string[];
  excludeCertifications: string[];
  maxRuntime?: number;
  mediaType?: "movie" | "tv";
};

type Availability = Pick<MediaTitle, "providers">;

export function titleAvailability(title: Availability, providerIds: string[]): TitleAvailability {
  if (title.providers.length === 0) {
    return "unknown";
  }

  if (providerIds.length === 0 || title.providers.some((entry) => providerIds.includes(entry.id))) {
    return "confirmed";
  }

  return "elsewhere";
}

export function meetsAvailability(
  title: Availability,
  providerIds: string[],
  availability: AvailabilityRule,
) {
  if (providerIds.length === 0) {
    return true;
  }

  const state = titleAvailability(title, providerIds);

  return state === "confirmed" || (state === "unknown" && availability === "confirmed-or-unknown");
}

export function eligibilityGate(eligibility: Eligibility) {
  const excluded = new Set(eligibility.excludeIds);
  const banned = new Set(eligibility.excludeGenres.map((genre) => genre.toLowerCase()));
  const barred = new Set(eligibility.excludeCertifications.map((value) => value.toLowerCase()));

  return (title: MediaTitle) => {
    if (excluded.has(title.id)) {
      return false;
    }

    if (!meetsAvailability(title, eligibility.providerIds, eligibility.availability)) {
      return false;
    }

    if (banned.size && title.genres.some((genre) => banned.has(genre.toLowerCase()))) {
      return false;
    }

    if (
      barred.size &&
      title.certification &&
      barred.has(certificationRating(title.certification))
    ) {
      return false;
    }

    if (
      eligibility.maxRuntime &&
      title.runtimeMinutes &&
      title.runtimeMinutes > eligibility.maxRuntime
    ) {
      return false;
    }

    return !eligibility.mediaType || title.mediaType === eligibility.mediaType;
  };
}
