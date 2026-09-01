import type { MediaTitle, ProviderAvailability } from "./catalog";

export const DEFAULT_PREFERRED_LANGUAGE = "en";

export const PREFERRED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "tr", label: "Turkish" },
] as const;

const LANGUAGE_CODE = /^[a-z]{2}$/u;
const SUPPORTED_LANGUAGE_CODES = new Set<string>(
  PREFERRED_LANGUAGES.map((language) => language.code),
);

export function preferredLanguage(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_PREFERRED_LANGUAGE;
  }

  const normalised = value.toLowerCase();

  return LANGUAGE_CODE.test(normalised) && SUPPORTED_LANGUAGE_CODES.has(normalised)
    ? normalised
    : DEFAULT_PREFERRED_LANGUAGE;
}

export function titleMatchesPreferredLanguage(
  originalLanguage: string | null | undefined,
  preference: string,
) {
  return (originalLanguage?.toLowerCase() || DEFAULT_PREFERRED_LANGUAGE) === preference;
}

export function languageCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.flatMap((entry) => {
        const normalised = typeof entry === "string" ? entry.trim().toLowerCase() : "";

        return LANGUAGE_CODE.test(normalised) ? [normalised] : [];
      }),
    ),
  ];
}

export function mergeLanguageCodes(...values: (readonly string[] | undefined)[]): string[] {
  return languageCodes(values.flatMap((value) => value ?? []));
}

function relevantProviders(providers: ProviderAvailability[], providerIds: readonly string[]) {
  if (providerIds.length === 0) {
    return providers;
  }

  const wanted = new Set(providerIds);

  return providers.filter((provider) => wanted.has(provider.id));
}

export function titleHasPreferredAudioLanguage(
  title: Pick<MediaTitle, "originalLanguage" | "providers">,
  preferences: readonly string[],
  providerIds: readonly string[] = [],
) {
  const wanted = new Set(languageCodes(preferences));

  if (wanted.size === 0) {
    return true;
  }

  const availableAudio = new Set(
    relevantProviders(title.providers, providerIds).flatMap(
      (provider) => provider.audioLanguages ?? [],
    ),
  );

  if (availableAudio.size > 0) {
    return [...wanted].some((language) => availableAudio.has(language));
  }

  return [...wanted].some((language) =>
    titleMatchesPreferredLanguage(title.originalLanguage, language),
  );
}
