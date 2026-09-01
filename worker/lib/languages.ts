import { DEFAULT_PREFERRED_LANGUAGE } from "../../src/domain/languages.ts";

/** SQL eligibility rule. Missing catalogue language is deliberately treated as English. */
export function preferredLanguageCondition(titleAlias: string, preferenceExpression: string) {
  return `COALESCE(NULLIF(lower(${titleAlias}.original_language), ''), '${DEFAULT_PREFERRED_LANGUAGE}') = lower(${preferenceExpression})`;
}
