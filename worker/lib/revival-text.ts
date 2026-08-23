const DOUBLE_ENCODED = /\u00C3\u00C2([\u00A0-\u00BF])/gu;
const SINGLE_ENCODED = /\u00C3([\u00A0-\u00BF])/gu;
const STRIPPED_REMNANT = /\u00C3\u00C2|\u00C2/gu;
// oxlint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

const ARTICLES = new Set([
  "the",
  "a",
  "an",
  "la",
  "le",
  "les",
  "der",
  "die",
  "das",
  "el",
  "los",
  "las",
  "il",
]);

const TRAILING_ARTICLE = /^(.*?)\s*,\s*(\w{1,4})\.?$/u;

export function repairText(value: string) {
  return value
    .replace(DOUBLE_ENCODED, (_, char: string) =>
      String.fromCodePoint(0xc0 + (char.codePointAt(0)! - 0x80)),
    )
    .replace(SINGLE_ENCODED, (_, char: string) =>
      String.fromCodePoint(0xc0 + (char.codePointAt(0)! - 0x80)),
    )
    .replace(STRIPPED_REMNANT, "")
    .replace(CONTROLS, "");
}

export function tidyText(value: string) {
  return repairText(value)
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/\s+([,.;:!?])/gu, "$1")
    .replaceAll(/\(\s+/gu, "(")
    .replaceAll(/\s+\)/gu, ")")
    .trim();
}

export function properTitle(value: string) {
  const tidied = tidyText(value);
  const match = TRAILING_ARTICLE.exec(tidied);

  if (!match) {
    return tidied;
  }

  const [, body, article] = match;

  if (!ARTICLES.has(article.toLowerCase()) || !body) {
    return tidied;
  }

  return `${article} ${body}`;
}

export function tidySynopsis(value: string) {
  return tidyText(value)
    .replaceAll(/\s*\.\)/gu, ".)")
    .replaceAll(/\(\s*\)/gu, "")
    .replaceAll(/\s{2,}/gu, " ")
    .trim();
}

const ARCHIVE_COLLECTION_LABELS: Record<string, string> = {
  silent_films: "Silent film",
  short_films: "Short film",
  classic_cartoons: "Cartoon",
  film_noir: "Film noir",
  scifi_horror: "Science fiction and horror",
  prelinger: "Ephemeral film",
  animationandcartoons: "Cartoon",
  newsandpublicaffairs: "News and public affairs",
  sports: "Sport",
};

export function archiveCollectionLabel(collection: string) {
  return ARCHIVE_COLLECTION_LABELS[collection.toLowerCase().replaceAll("-", "_")] ?? null;
}
