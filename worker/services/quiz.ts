import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { GameKind, GameOption, GameQuestion } from "../../src/domain/screening.ts";
import { withDatabase } from "../database/runtime.ts";
import { shuffled } from "../lib/random.ts";
import { readRatingsMap } from "../repositories/catalog-ratings.ts";
import type { Bindings, WorkerBindings } from "../types.ts";
import { browseCatalogue } from "./catalog.ts";

export type QuizQuestion = GameQuestion & { correct: string };

const POOL_PAGES = [0, 1, 2, 3];
const MIN_VOTES = 2_000;
const MIN_POOL = 12;
const RECENT_YEARS = 1;
const OVERVIEW_MIN = 80;
const OVERVIEW_MAX = 220;
const OPTIONS = 4;

type Pool = {
  titles: MediaTitle[];
  scores: Map<string, number>;
  directors: Map<string, string>;
};

function option(title: MediaTitle): GameOption {
  return { id: title.id, label: title.title, posterUrl: title.posterUrl, note: null };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

function escapePattern(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function maskTitle(overview: string, title: string) {
  const words = title.split(/\s+/u).filter((word) => word.length > 3);
  let masked = overview.replaceAll(new RegExp(escapePattern(title), "giu"), "…");

  for (const word of words) {
    masked = masked.replaceAll(new RegExp(`\\b${escapePattern(word)}\\b`, "giu"), "…");
  }

  return masked.length > OVERVIEW_MAX ? `${masked.slice(0, OVERVIEW_MAX - 1)}…` : masked;
}

function isReleased(title: MediaTitle, today: string) {
  return Boolean(title.releaseDate && title.releaseDate <= today);
}

async function loadPool(runtime: Bindings): Promise<Pool> {
  const today = new Date().toISOString().slice(0, 10);
  const pages = await Promise.all(
    POOL_PAGES.map((page) =>
      browseCatalogue(runtime, {
        mediaType: "movie",
        genres: [],
        keywords: [],
        places: [],
        providerIds: [],
        query: "",
        sort: "popularity",
        page,
      }),
    ),
  );
  const seen = new Set<string>();
  const candidates = pages
    .flatMap((page) => page.items)
    .filter((title) => {
      if (seen.has(title.id) || !title.posterUrl || !title.year || !isReleased(title, today)) {
        return false;
      }

      seen.add(title.id);

      return true;
    });
  const ratings = await readRatingsMap(
    runtime.DB,
    candidates.map((title) => title.id),
  );
  const known = candidates.filter((title) => (ratings.get(title.id)?.imdbVotes ?? 0) >= MIN_VOTES);
  const titles = known.length >= MIN_POOL ? known : candidates;
  const scores = new Map<string, number>();

  for (const title of titles) {
    const score = ratings.get(title.id)?.imdbScore;

    if (typeof score === "number") {
      scores.set(title.id, score);
    }
  }

  const ids = titles.map((title) => title.id);
  const credits = ids.length
    ? await runtime.DB.query<{ titleId: string; name: string }>(
        `SELECT DISTINCT ON (c.title_id) c.title_id AS "titleId", p.name
           FROM catalog_credits AS c
           JOIN catalog_people AS p ON p.person_id = c.person_id
          WHERE c.job = 'Director' AND c.title_id IN (${ids.map((_, index) => `$${index + 1}`).join(",")})
          ORDER BY c.title_id, c.billing NULLS LAST`,
        [...ids],
      )
    : { rows: [] };
  const directors = new Map(credits.rows.map((row) => [row.titleId, row.name]));

  return { titles, scores, directors };
}

function firstQuestion(pool: Pool): QuizQuestion | null {
  const [left, right] = shuffled(pool.titles).filter(
    (title, index, all) => index === 0 || title.year !== all[0].year,
  );

  if (!left || !right || !left.year || !right.year) {
    return null;
  }

  return {
    kind: "first",
    prompt: "Which of these came out first?",
    posterUrl: null,
    options: shuffled([option(left), option(right)]),
    correct: left.year < right.year ? left.id : right.id,
  };
}

function higherQuestion(pool: Pool): QuizQuestion | null {
  const rated = shuffled(pool.titles.filter((title) => pool.scores.has(title.id)));
  const anchor = rated[0];
  const target = rated.find(
    (title) => pool.scores.get(title.id) !== pool.scores.get(anchor?.id ?? ""),
  );

  if (!anchor || !target) {
    return null;
  }

  const anchorScore = pool.scores.get(anchor.id) ?? 0;
  const targetScore = pool.scores.get(target.id) ?? 0;

  return {
    kind: "higher",
    prompt: `${anchor.title} scored ${anchorScore.toFixed(1)} on IMDb. Is ${target.title} higher or lower?`,
    posterUrl: target.posterUrl,
    options: [
      { id: "higher", label: "Higher", posterUrl: null, note: null },
      { id: "lower", label: "Lower", posterUrl: null, note: null },
    ],
    correct: targetScore > anchorScore ? "higher" : "lower",
  };
}

function whoseQuestion(pool: Pool): QuizQuestion | null {
  const directed = shuffled(pool.titles.filter((title) => pool.directors.has(title.id)));
  const subject = directed[0];
  const answer = subject ? pool.directors.get(subject.id) : undefined;

  if (!subject || !answer) {
    return null;
  }

  const names = new Set<string>([answer]);

  for (const title of directed.slice(1)) {
    const name = pool.directors.get(title.id);

    if (name && names.size < OPTIONS) {
      names.add(name);
    }
  }

  if (names.size < OPTIONS) {
    return null;
  }

  return {
    kind: "whose",
    prompt: `Who directed ${subject.title}?`,
    posterUrl: subject.posterUrl,
    options: shuffled([...names]).map((name) => ({
      id: slug(name),
      label: name,
      posterUrl: null,
      note: null,
    })),
    correct: slug(answer),
  };
}

function describeQuestion(pool: Pool): QuizQuestion | null {
  const described = shuffled(pool.titles.filter((title) => title.overview.length >= OVERVIEW_MIN));
  const subject = described[0];

  if (!subject || described.length < OPTIONS) {
    return null;
  }

  return {
    kind: "describe",
    prompt: maskTitle(subject.overview, subject.title),
    posterUrl: null,
    options: shuffled(described.slice(0, OPTIONS)).map(option),
    correct: subject.id,
  };
}

const BUILDERS: Record<GameKind, (pool: Pool) => QuizQuestion | null> = {
  first: firstQuestion,
  higher: higherQuestion,
  whose: whoseQuestion,
  describe: describeQuestion,
};

export async function buildQuiz(env: WorkerBindings, kinds: GameKind[], rounds: number) {
  return withDatabase(env, async (runtime) => {
    const pool = await loadPool(runtime);
    const questions: QuizQuestion[] = [];
    const order = shuffled(kinds);
    let attempts = 0;

    while (questions.length < rounds && attempts < rounds * 4) {
      const kind = order[attempts % order.length];
      const question = BUILDERS[kind](pool);

      attempts += 1;

      if (question && !questions.some((known) => known.prompt === question.prompt)) {
        questions.push(question);
      }
    }

    return questions;
  });
}

export async function steerPool(env: WorkerBindings, size: number) {
  return withDatabase(env, async (runtime) => {
    const { titles } = await loadPool(runtime);
    const floor = new Date().getFullYear() - RECENT_YEARS;
    const recent = titles.filter((title) => (title.year ?? 0) >= floor);

    return shuffled(recent.length >= size * 2 ? recent : titles).slice(0, size);
  });
}
