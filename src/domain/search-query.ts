const DESCRIPTIVE_MARKERS = new Set([
  "anything",
  "directed",
  "films",
  "movies",
  "recommend",
  "recommendations",
  "series",
  "shows",
  "similar",
  "something",
  "starring",
  "vibe",
  "vibes",
]);

const COVERAGE_SAMPLE = 5;

export type SearchCandidate = {
  title: string;
  originalTitle?: string;
};

export function searchTokens(raw: string) {
  return raw
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

export function isDescriptiveQuery(query: string) {
  return searchTokens(query).some((token) => DESCRIPTIVE_MARKERS.has(token));
}

function covers(tokens: string[], text: string) {
  const words = searchTokens(text);

  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

export function hasLexicalMatch(query: string, items: SearchCandidate[]) {
  const tokens = searchTokens(query);

  if (tokens.length === 0) {
    return false;
  }

  return items
    .slice(0, COVERAGE_SAMPLE)
    .some((item) => covers(tokens, item.title) || covers(tokens, item.originalTitle ?? ""));
}

export function shouldRefineSearch(query: string, items: SearchCandidate[]) {
  if (searchTokens(query).length === 0) {
    return false;
  }

  return isDescriptiveQuery(query) || !hasLexicalMatch(query, items);
}
