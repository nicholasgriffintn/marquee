import type { MediaTitle } from "../../src/domain/catalog.ts";
import { MEAN_SCORE, RATING_WEIGHTS, VOTE_PRIOR } from "../../src/domain/ratings.ts";

type RatingTerm = { weight: number; present: boolean; value: number; damped: number };

function dampedValue(score: number | null, votes: number | null) {
  const safeVotes = Math.max(0, votes ?? 0);

  return (safeVotes * (score ?? 0) + VOTE_PRIOR * MEAN_SCORE) / (safeVotes + VOTE_PRIOR);
}

function rottenValue(value: string | null | undefined) {
  const parsed = Number.parseFloat((value ?? "0").replace("%", ""));

  return (Number.isFinite(parsed) ? parsed : 0) / 10;
}

function ratingTerms(item: MediaTitle): RatingTerm[] {
  const ratings = item.ratings;

  return [
    {
      weight: RATING_WEIGHTS.tmdb,
      present: item.tmdbScore !== null,
      value: item.tmdbScore ?? 0,
      damped: dampedValue(item.tmdbScore, item.tmdbVoteCount),
    },
    {
      weight: RATING_WEIGHTS.imdb,
      present: ratings?.imdbScore != null,
      value: ratings?.imdbScore ?? 0,
      damped: dampedValue(ratings?.imdbScore ?? null, ratings?.imdbVotes ?? null),
    },
    {
      weight: RATING_WEIGHTS.rottenTomatoes,
      present: ratings?.rottenTomatoes != null,
      value: rottenValue(ratings?.rottenTomatoes),
      damped: rottenValue(ratings?.rottenTomatoes),
    },
    {
      weight: RATING_WEIGHTS.metascore,
      present: ratings?.metascore != null,
      value: (ratings?.metascore ?? 0) / 10,
      damped: (ratings?.metascore ?? 0) / 10,
    },
    {
      weight: RATING_WEIGHTS.mal,
      present: ratings?.animeScore != null,
      value: ratings?.animeScore ?? 0,
      damped: ratings?.animeScore ?? 0,
    },
  ];
}

function blend(terms: RatingTerm[], pick: (term: RatingTerm) => number) {
  const weight = terms.reduce((total, term) => total + (term.present ? term.weight : 0), 0);

  if (weight === 0) {
    return 0;
  }

  const total = terms.reduce((sum, term) => sum + (term.present ? term.weight * pick(term) : 0), 0);

  return total / weight;
}

export function computeBlendedRating(item: MediaTitle) {
  return blend(ratingTerms(item), (term) => term.value);
}

export function computeWeightedRating(item: MediaTitle) {
  const [tmdb, ...rest] = ratingTerms(item);

  if (!tmdb) {
    return 0;
  }

  return blend([{ ...tmdb, present: true }, ...rest], (term) => term.damped);
}
