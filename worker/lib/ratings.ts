import { MEAN_SCORE, RATING_WEIGHTS, VOTE_PRIOR } from "../../src/domain/ratings.ts";

type SqlRatingSource = { weight: number; guard: string; value: string; damped: string };

function damped(score: string, votes: string) {
  return `((${votes} * COALESCE(${score}, 0) + ${VOTE_PRIOR} * ${MEAN_SCORE}) / (${votes} + ${VOTE_PRIOR}))`;
}

function ratingSources(payload: string): SqlRatingSource[] {
  const at = (path: string) => `json_extract(${payload}, '$.${path}')`;
  const tmdbScore = at("tmdbScore");
  const tmdbVotes = `COALESCE(${at("tmdbVoteCount")}, 0)`;
  const imdbScore = at("ratings.imdbScore");
  const imdbVotes = `COALESCE(${at("ratings.imdbVotes")}, 0)`;
  const rotten = at("ratings.rottenTomatoes");
  const metascore = at("ratings.metascore");
  const anilist = at("ratings.anilistScore");
  const rottenValue = `(CAST(replace(COALESCE(${rotten}, '0'), '%', '') AS REAL) / 10.0)`;

  return [
    {
      weight: RATING_WEIGHTS.tmdb,
      guard: tmdbScore,
      value: `COALESCE(${tmdbScore}, 0)`,
      damped: damped(tmdbScore, tmdbVotes),
    },
    {
      weight: RATING_WEIGHTS.imdb,
      guard: imdbScore,
      value: `COALESCE(${imdbScore}, 0)`,
      damped: damped(imdbScore, imdbVotes),
    },
    {
      weight: RATING_WEIGHTS.rottenTomatoes,
      guard: rotten,
      value: rottenValue,
      damped: rottenValue,
    },
    {
      weight: RATING_WEIGHTS.metascore,
      guard: metascore,
      value: `(COALESCE(${metascore}, 0) / 10.0)`,
      damped: `(COALESCE(${metascore}, 0) / 10.0)`,
    },
    {
      weight: RATING_WEIGHTS.anilist,
      guard: anilist,
      value: `(COALESCE(${anilist}, 0) / 10.0)`,
      damped: `(COALESCE(${anilist}, 0) / 10.0)`,
    },
  ];
}

function blend(sources: SqlRatingSource[], pick: (source: SqlRatingSource) => string) {
  const total = sources
    .map(
      (source) =>
        `CASE WHEN ${source.guard} IS NULL THEN 0 ELSE ${source.weight} * ${pick(source)} END`,
    )
    .join(" + ");
  const weight = sources
    .map((source) => `CASE WHEN ${source.guard} IS NULL THEN 0 ELSE ${source.weight} END`)
    .join(" + ");

  return `(CASE WHEN (${weight}) = 0 THEN 0 ELSE (${total}) / (${weight}) END)`;
}

export function blendedRatingSql(payload: string) {
  return blend(ratingSources(payload), (source) => source.value);
}

export function weightedRatingSql(payload: string) {
  const sources = ratingSources(payload);
  const [tmdb, ...rest] = sources;

  if (!tmdb) {
    return "0";
  }

  return blend(
    [{ ...tmdb, guard: `COALESCE(${tmdb.guard}, 0)` }, ...rest],
    (source) => source.damped,
  );
}
