export const MAX_QUERY_TOKENS = 8;

export function tsQueryFromTokens(tokens: string[], matchAny = false) {
  if (tokens.length === 0) {
    return null;
  }

  const last = tokens.length - 1;

  return tokens
    .map((token, index) => (index === last ? `${token}:*` : token))
    .join(matchAny ? " | " : " & ");
}
