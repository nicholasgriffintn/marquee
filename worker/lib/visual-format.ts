export const BLACK_AND_WHITE = "black and white";

export const ACADEMY_RATIO = "1.37:1";

const COLOURS = new Map([
  ["black-and-white", BLACK_AND_WHITE],
  ["black and white", BLACK_AND_WHITE],
  ["color", "colour"],
  ["colour", "colour"],
  ["color motion picture film", "colour"],
  ["sepia", "sepia"],
]);

const RATIO_PATTERN = /^(\d{1,2}(?:\.\d{1,3})?)\s*:\s*(\d{1,2}(?:\.\d{1,3})?)$/u;

const NARROWEST = 1;
const WIDEST = 3;

function distinct(values: (string | null)[]) {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function colourFrom(label: string) {
  return COLOURS.get(label.trim().toLowerCase()) ?? null;
}

function ratioFrom(label: string) {
  const normalised = label.trim().toLowerCase();

  if (normalised === "academy ratio") {
    return ACADEMY_RATIO;
  }

  const match = RATIO_PATTERN.exec(normalised);

  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const ratio = height > 0 ? width / height : 0;

  return ratio >= NARROWEST && ratio <= WIDEST ? `${ratio.toFixed(2)}:1` : null;
}

export function normaliseColours(labels: string[]) {
  return distinct(labels.map(colourFrom));
}

export function normaliseAspectRatios(labels: string[]) {
  return distinct(labels.map(ratioFrom));
}
