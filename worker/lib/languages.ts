import { DEFAULT_PREFERRED_LANGUAGE } from "../../src/domain/languages.ts";

/** SQL eligibility rule. Missing catalogue language is deliberately treated as English. */
export function preferredLanguageCondition(titleAlias: string, preferenceExpression: string) {
  return `COALESCE(NULLIF(lower(${titleAlias}.original_language), ''), '${DEFAULT_PREFERRED_LANGUAGE}') = lower(${preferenceExpression})`;
}

type AudioLanguageScope = {
  providerIdsExpression?: string;
  providerIdExpression?: string;
};

function providerScope(alias: string, scope: AudioLanguageScope) {
  if (scope.providerIdExpression) {
    return `${alias}.provider_id = ${scope.providerIdExpression}`;
  }

  if (!scope.providerIdsExpression) {
    return "TRUE";
  }

  const ids = `CAST(COALESCE(NULLIF(${scope.providerIdsExpression}, ''), '[]') AS jsonb)`;

  return `(jsonb_array_length(${ids}) = 0 OR ${alias}.provider_id IN (
    SELECT value FROM jsonb_array_elements_text(${ids}) AS selected(value)
  ))`;
}

export function preferredAudioLanguageCondition(
  titleAlias: string,
  preferenceExpression: string,
  scope: AudioLanguageScope = {},
) {
  const languageScope = providerScope("pal", scope);

  return `(
    EXISTS (
      SELECT 1 FROM catalog_title_provider_languages AS pal
       WHERE pal.title_id = ${titleAlias}.id
         AND pal.kind = 'audio'
         AND ${languageScope}
         AND pal.language = lower(${preferenceExpression})
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM catalog_title_provider_languages AS pal
         WHERE pal.title_id = ${titleAlias}.id
           AND pal.kind = 'audio'
           AND ${languageScope}
      )
      AND ${preferredLanguageCondition(titleAlias, preferenceExpression)}
    )
  )`;
}
