export type UsherFace = "idle" | "thinking" | "pleased" | "unimpressed" | "dormant";

export type UsherAnswerKind = "chips" | "single" | "people" | "titles";

export type UsherOption = { value: string; label: string; hint?: string };

export type UsherQuestion = {
  id: string;
  kind: UsherAnswerKind;
  line: string;
  hint?: string;
  options?: UsherOption[];
  min?: number;
  max?: number;
};

export type UsherAction = { id: string; label: string };

export type UsherMoment = {
  id: string;
  kind: string;
  surface: string;
  face: UsherFace;
  line: string;
  question?: UsherQuestion;
  actions?: UsherAction[];
  step?: number;
  total?: number;
};

export type UsherState = {
  status: "new" | "in-progress" | "done" | "dismissed";
  answered: string[];
  moment: UsherMoment | null;
};

export type UsherPick = {
  titleId: string;
  line: string;
};

export const USHER_SURFACES = [
  "first-run",
  "home",
  "rail",
  "title",
  "shelf",
  "search-empty",
] as const;

export type UsherSurface = (typeof USHER_SURFACES)[number];

export function isUsherSurface(value: unknown): value is UsherSurface {
  return typeof value === "string" && USHER_SURFACES.includes(value as UsherSurface);
}

export const WATCH_FREQUENCY: UsherOption[] = [
  { value: "nightly", label: "Most nights" },
  { value: "weekly", label: "A few times a week" },
  { value: "occasional", label: "Once a week or so" },
  { value: "rare", label: "When something makes me" },
];

export const WATCH_MOTIVATION: UsherOption[] = [
  { value: "switch-off", label: "To switch off" },
  { value: "get-lost", label: "To get lost in it" },
  { value: "critics", label: "I follow the reviews" },
  { value: "cast", label: "I follow the cast" },
  { value: "talked-about", label: "Whatever people are talking about" },
  { value: "background", label: "Something on in the background" },
  { value: "together", label: "Whatever the room agrees on" },
];

export const RUNTIME_TOLERANCE: UsherOption[] = [
  { value: "short", label: "Under 100 minutes" },
  { value: "any", label: "Length doesn't bother me" },
  { value: "long", label: "The longer the better" },
];

export const SUBTITLE_APPETITE: UsherOption[] = [
  { value: "happy", label: "Happily" },
  { value: "sometimes", label: "If it's worth it" },
  { value: "never", label: "Rather not" },
];

export const NOVELTY: UsherOption[] = [
  { value: "new", label: "Always something new" },
  { value: "mixed", label: "A bit of both" },
  { value: "rewatch", label: "I rewatch what I love" },
];
