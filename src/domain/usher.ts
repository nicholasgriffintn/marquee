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

export type TimeSlot = "small-hours" | "morning" | "afternoon" | "evening" | "late";

export type Showing = {
  slot: TimeSlot;
  maxRuntime: number | null;
  brief: string;
  nudge: string;
};

export function showingFor(hour: number, isWeekend = false): Showing {
  if (hour >= 0 && hour < 5) {
    return {
      slot: "small-hours",
      maxRuntime: 100,
      brief:
        "It is the small hours. Offer something short, under a hundred minutes, and say so plainly.",
      nudge: "Everyone's gone home. Something short?",
    };
  }

  if (hour < 12) {
    return {
      slot: "morning",
      maxRuntime: null,
      brief: "It is the morning, which is an odd hour to be doing this. Keep it light.",
      nudge: "Bit early. Go on then.",
    };
  }

  if (hour < 17) {
    return {
      slot: "afternoon",
      maxRuntime: null,
      brief: isWeekend
        ? "It is a weekend afternoon. There is time for the long one, if it earns it."
        : "It is the afternoon.",
      nudge: isWeekend
        ? "Whole afternoon. Now's the time for a long one."
        : "Afternoon. I'll pick.",
    };
  }

  if (hour < 23) {
    return {
      slot: "evening",
      maxRuntime: null,
      brief: "It is the evening, the proper time for this.",
      nudge: "Still deciding? I'll pick.",
    };
  }

  return {
    slot: "late",
    maxRuntime: 125,
    brief: "It is nearly midnight. Nothing over two hours, and mention the hour.",
    nudge: "It's late. Last one.",
  };
}

export function showingNow(): Showing {
  const now = new Date();

  return showingFor(now.getHours(), now.getDay() === 0 || now.getDay() === 6);
}

const ASIDES: { test: RegExp; line: string }[] = [
  {
    test: /\b(who|what) (are|r) (you|u)\b|\byour name\b|\bwho'?s this\b/iu,
    line: "The Usher. I work here. There is a film about it, if you are that interested.",
  },
  {
    test: /\b(are you|you'?re) (an? )?(ai|bot|robot|real|human|person)\b/iu,
    line: "I am a letter of the alphabet with a torch. Make of that what you like.",
  },
  {
    test: /\bhow old\b|\bwhen did you (start|begin)\b|\bhow long have you\b/iu,
    line: "I came down off the sign in 1974. I have not been back up.",
  },
  {
    test: /\b(the )?manager\b/iu,
    line: "Not in. He is never in.",
  },
  {
    test: /\bprojectionist\b/iu,
    line: "He does the reels. I do the door. We have not spoken since 1988.",
  },
  {
    test: /^(hi|hey|hello|evening|good evening|alright)\b/iu,
    line: "Evening. Are we watching something, or are we chatting?",
  },
  {
    test: /\bwhat do you (do|want)\b|\byour job\b/iu,
    line: "I show people to their seats. Occasionally I stop them going somewhere they shouldn't.",
  },
];

export function asideFor(prompt: string) {
  const trimmed = prompt.trim();

  if (trimmed.length > 60) {
    return null;
  }

  return ASIDES.find((aside) => aside.test.test(trimmed))?.line ?? null;
}
