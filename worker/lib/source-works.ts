const WORK_TYPE_ORDER = [
  "novel",
  "novel series",
  "short story",
  "short story collection",
  "novella",
  "novelization",
  "poem",
  "epic poem",
  "fairy tale",
  "folk tale",
  "play",
  "dramatic work",
  "dramatico-musical work",
  "musical",
  "opera",
  "religious text",
  "book of the Bible",
  "autobiography",
  "biography",
  "non-fiction work",
  "literary work",
  "written work",
  "book series",
  "graphic novel",
  "comic book series",
  "comic book album",
  "comic book storyline",
  "comic strip",
  "manga series",
  "light novel series",
  "video game",
  "video game series",
  "animated film",
  "short film",
  "film",
  "film series",
  "animated television series",
  "anime television series",
  "limited series",
  "television series",
  "television program",
  "web series",
  "radio drama",
  "song",
  "album",
  "musical work/composition",
  "serialized fiction",
  "media franchise",
];

const BRITISH_LABELS: Record<string, string> = {
  "television program": "television programme",
  "serialized fiction": "serialised fiction",
  novelization: "novelisation",
};

export function preferredWorkType(labels: string[]) {
  const offered = new Set(labels.map((label) => label.toLowerCase()));
  const matched = WORK_TYPE_ORDER.find((type) => offered.has(type));

  return matched ? (BRITISH_LABELS[matched] ?? matched) : null;
}
