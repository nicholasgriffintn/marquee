const SUPPRESSED_COLLECTIONS = new Set([
  "no-preview",
  "deemphasize",
  "unwanted",
  "spam",
  "flagged",
]);

const STRONG =
  /\b(sex[\s-]?exploitation|pornograph\w*|porno|xxx|hardcore|softcore|bdsm|striptease|tortured females|peep show|nudist|nudie|smut|adults? only|blue movie)\b/iu;

const WEAK =
  /\b(fetish|burlesque|erotic\w*|nudes?|naked|sexy|stag|spanking|whipping|bondage|slavery|abduction|catfight|hooker\w*|brothel|prostitut\w*|corporal punishment|promiscuity|premarital sex|casting couch|exploitation film)\b/giu;

const WEAK_THRESHOLD = 2;

export function isSuppressedCollection(collections: readonly string[]) {
  return collections.some((entry) => SUPPRESSED_COLLECTIONS.has(entry.toLowerCase()));
}

export function isUnsuitable(input: {
  title: string;
  subjects?: readonly string[];
  synopsis?: string;
  collections?: readonly string[];
}) {
  if (input.collections && isSuppressedCollection(input.collections)) {
    return true;
  }

  const haystack = [input.title, input.synopsis ?? "", ...(input.subjects ?? [])].join(" ");

  if (STRONG.test(haystack)) {
    return true;
  }

  const weak = new Set((haystack.match(WEAK) ?? []).map((word) => word.toLowerCase()));

  return weak.size >= WEAK_THRESHOLD;
}
