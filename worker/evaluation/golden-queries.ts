export type GoldenQuery = {
  id: string;
  query: string;
  mode: "keyword" | "hybrid";
  /** Titles that must come back, identified by catalogue id. */
  expect: string[];
  /** How far down the list an expected title still counts as found. */
  within: number;
  /** Titles that must not come back at all. */
  absent?: string[];
  note: string;
};

// Fixtures name titles by catalogue id so a rename upstream cannot quietly turn a
// miss into a hit. A fixture whose titles are not in the catalogue is reported as
// skipped rather than failed: that is a coverage gap, not a ranking regression.
export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  {
    id: "exact-title",
    query: "The Matrix",
    mode: "keyword",
    expect: ["movie:603"],
    within: 3,
    note: "An exact title should be the first thing anyone sees.",
  },
  {
    id: "exact-title-series",
    query: "Breaking Bad",
    mode: "keyword",
    expect: ["tv:1396"],
    within: 3,
    note: "Series match on an exact name.",
  },
  {
    id: "misspelling",
    query: "gooodfellas",
    mode: "hybrid",
    expect: ["movie:769"],
    within: 10,
    note: "A doubled letter should still land the film.",
  },
  {
    id: "translated-title",
    query: "Spirited Away",
    mode: "keyword",
    expect: ["movie:129"],
    within: 5,
    note: "The English release title of a Japanese film.",
  },
  {
    id: "franchise",
    query: "Godfather",
    mode: "keyword",
    expect: ["movie:238", "movie:240"],
    within: 5,
    note: "Both parts of a franchise in the first handful.",
  },
  {
    id: "description-only",
    query: "a replicant hunter in a rain-soaked future Los Angeles",
    mode: "hybrid",
    expect: ["movie:78"],
    within: 10,
    note: "Plot description with no title words in it at all.",
  },
  {
    id: "mood",
    query: "quiet slow film about grief",
    mode: "hybrid",
    expect: [],
    within: 10,
    note: "A mood query should return something rather than nothing.",
  },
  {
    id: "ambiguous-name",
    query: "Alien",
    mode: "keyword",
    expect: ["movie:348"],
    within: 5,
    absent: ["movie:603"],
    note: "A short common word must not drag in unrelated titles.",
  },
  {
    id: "director",
    query: "Akira Kurosawa samurai",
    mode: "hybrid",
    expect: ["movie:346"],
    within: 10,
    note: "A director's name paired with a subject.",
  },
  {
    id: "place-name-series",
    query: "Twin Peaks",
    mode: "keyword",
    expect: ["tv:1920"],
    within: 5,
    note: "Series that shares its name with a place.",
  },
] as const;
