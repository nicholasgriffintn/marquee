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
