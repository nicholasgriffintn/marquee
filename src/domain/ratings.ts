import type { MediaTitle } from "./catalog";

export const VOTE_PRIOR = 250;
export const MEAN_SCORE = 6.5;

export const RATING_WEIGHTS = {
  tmdb: 1,
  imdb: 1.3,
  rottenTomatoes: 0.8,
  metascore: 0.8,
  anilist: 0.8,
} as const;

export type RatingKey = keyof typeof RATING_WEIGHTS;

export type RatingSource = {
  key: RatingKey;
  label: string;
  display: string;
  outOfTen: boolean;
  score: number;
  votes: number | null;
};

export function rottenTomatoesScore(value: string | null | undefined) {
  const parsed = value ? Number.parseInt(value.replace("%", ""), 10) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function ratingSources(item: MediaTitle): RatingSource[] {
  const ratings = item.ratings;
  const rotten = rottenTomatoesScore(ratings?.rottenTomatoes);
  const sources: RatingSource[] = [];

  if (item.tmdbScore !== null && item.tmdbVoteCount > 0) {
    sources.push({
      key: "tmdb",
      label: "TMDB",
      outOfTen: true,
      display: item.tmdbScore.toFixed(1),
      score: item.tmdbScore,
      votes: item.tmdbVoteCount,
    });
  }

  if (ratings?.imdbScore != null) {
    sources.push({
      key: "imdb",
      label: "IMDb",
      display: ratings.imdbScore.toFixed(1),
      outOfTen: true,
      score: ratings.imdbScore,
      votes: ratings.imdbVotes ?? null,
    });
  }

  if (rotten !== null) {
    sources.push({
      key: "rottenTomatoes",
      label: "Rotten Tomatoes",
      display: `${rotten}%`,
      outOfTen: false,
      score: rotten / 10,
      votes: null,
    });
  }

  if (ratings?.metascore != null) {
    sources.push({
      key: "metascore",
      label: "Metacritic",
      display: `${ratings.metascore}`,
      outOfTen: false,
      score: ratings.metascore / 10,
      votes: null,
    });
  }

  if (ratings?.anilistScore != null) {
    sources.push({
      key: "anilist",
      label: "AniList",
      display: `${ratings.anilistScore}%`,
      outOfTen: false,
      score: ratings.anilistScore / 10,
      votes: null,
    });
  }

  return sources;
}

export function blendedRating(item: MediaTitle) {
  const sources = ratingSources(item);

  if (sources.length === 0) {
    return null;
  }

  const weight = sources.reduce((total, source) => total + RATING_WEIGHTS[source.key], 0);
  const score = sources.reduce(
    (total, source) => total + RATING_WEIGHTS[source.key] * source.score,
    0,
  );

  return { score: score / weight, sources };
}
