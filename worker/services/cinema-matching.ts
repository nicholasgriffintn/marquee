import { clamp } from "../lib/numbers.ts";
import type { UnmatchedFilm } from "../repositories/cinemas.ts";

const MAX_TOKENS = 8;

const EVENT_PHRASE =
  /\b(\d{1,3}(st|nd|rd|th)\s+anniversary|anniversary\s+re[-\s]?release|in\s+concert|live\s+in\s+concert)\b/giu;

const DECORATION =
  /\b(imax|4dx|screenx|3d|2d|70mm|35mm|dbox|d-box|dolby(\s+cinema)?|atmos|hfr|ov|omu|subtitled|sub|audio\s+described|relaxed|autism\s+friendly|senior|kids?\s+club|toddler|parent\s*(and|&)\s*baby|unlimited\s+screening|secret\s+screening|members?\s+preview|preview|premiere|re[-\s]?release|anniversary|remastered|encore|singalong|sing[-\s]?a[-\s]?long)\b/giu;

const BRACKETED = /[([{][^)\]}]*[)\]}]/gu;
const GUEST_TAIL = /\s*[-–—|:]\s*(q\s*(and|&)\s*a\s*)?with\b[^-–—|]*$/iu;
const QA_TAIL = /\s*[-–—|:]?\s*q\s*(and|&)\s*a\b.*$/iu;
const TRAILING_YEAR = /\b(19|20)\d{2}\b\s*$/u;
const SEPARATOR_EDGES = /^\s*[-–—:|]+\s*|\s*[-–—:|]+\s*$/gu;
const SEPARATOR_RUN = /\s*([-–—|])\s*(?=[-–—|])/gu;

export function cleanFilmTitle(raw: string) {
  return raw
    .replaceAll(BRACKETED, " ")
    .replace(GUEST_TAIL, " ")
    .replace(QA_TAIL, " ")
    .replaceAll(EVENT_PHRASE, " ")
    .replaceAll(DECORATION, " ")
    .replace(TRAILING_YEAR, " ")
    .replaceAll(SEPARATOR_RUN, " ")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(SEPARATOR_EDGES, "")
    .trim();
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);
}

type CandidateRow = {
  id: string;
  title: string;
  originalTitle: string;
  year: number | null;
  runtimeMinutes: number | null;
  popularity: number;
};

export function scoreCandidate(film: UnmatchedFilm, candidate: CandidateRow) {
  const wanted = new Set(tokens(cleanFilmTitle(film.sourceTitle)));

  if (wanted.size === 0) {
    return 0;
  }

  const titleTokens = tokens(candidate.title);
  const originalTokens = tokens(candidate.originalTitle);
  const overlap = (words: string[]) => {
    if (words.length === 0) {
      return 0;
    }

    const shared = words.filter((word) => wanted.has(word)).length;

    return (2 * shared) / (wanted.size + words.length);
  };

  const titleScore = Math.max(overlap(titleTokens), overlap(originalTokens));

  if (titleScore < 0.5) {
    return 0;
  }

  let score = titleScore * 0.7;

  if (film.sourceYear && candidate.year) {
    const drift = Math.abs(film.sourceYear - candidate.year);

    score += drift === 0 ? 0.2 : drift === 1 ? 0.1 : -0.25;
  }

  if (film.runtimeMinutes && candidate.runtimeMinutes) {
    const drift = Math.abs(film.runtimeMinutes - candidate.runtimeMinutes);

    score += drift <= 5 ? 0.15 : drift <= 15 ? 0.05 : -0.2;
  }

  if (titleScore === 1) {
    score += 0.05;
  }

  return clamp(score, 0, 1);
}

export const MATCH_THRESHOLD = 0.62;

export async function findTitleForFilm(db: D1Database, film: UnmatchedFilm) {
  const cleaned = cleanFilmTitle(film.sourceTitle);
  const searchTokens = tokens(cleaned);

  if (searchTokens.length === 0) {
    return { titleId: null, confidence: 0 };
  }

  const expression = searchTokens.map((token) => `"${token}"*`).join(" OR ");
  const rows = await db
    .prepare(
      `SELECT t.id, t.title, t.original_title AS originalTitle, t.year,
              json_extract(t.payload, '$.runtimeMinutes') AS runtimeMinutes,
              t.popularity
       FROM catalog_search AS s
       JOIN catalog_titles AS t ON t.id = s.title_id
       WHERE catalog_search MATCH ?
         AND t.media_type = 'movie'
       ORDER BY bm25(catalog_search, 12.0, 8.0, 1.0, 4.0, 3.0, 0.0)
       LIMIT 25`,
    )
    .bind(`{title original_title} : (${expression})`)
    .all<CandidateRow>();

  let best: { titleId: string; confidence: number } | null = null;

  for (const candidate of rows.results) {
    const confidence = scoreCandidate(film, candidate);

    if (!best || confidence > best.confidence) {
      best = { titleId: candidate.id, confidence };
    }
  }

  return best && best.confidence >= MATCH_THRESHOLD
    ? best
    : { titleId: null, confidence: best?.confidence ?? 0 };
}
