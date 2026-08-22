import type { MediaTitle } from "../domain/catalog";

export function mediaMeta(item: MediaTitle) {
  const values = [
    item.year?.toString(),
    item.certification,
    item.mediaType === "movie"
      ? item.runtimeMinutes
        ? `${item.runtimeMinutes} min`
        : null
      : item.numberOfSeasons
        ? `${item.numberOfSeasons} season${item.numberOfSeasons === 1 ? "" : "s"}`
        : null,
    item.genres.slice(0, 2).join(" / ") || null,
  ];

  return values.filter(Boolean).join(" · ");
}

export function scoreLabel(item: MediaTitle) {
  return item.tmdbScore === null ? "Not yet rated" : `${item.tmdbScore.toFixed(1)} / 10`;
}

export function voteLabel(item: MediaTitle) {
  if (item.tmdbScore === null || item.tmdbVoteCount === 0) {
    return "";
  }

  return item.tmdbVoteCount >= 1_000
    ? `${(item.tmdbVoteCount / 1_000).toFixed(item.tmdbVoteCount >= 10_000 ? 0 : 1)}k votes`
    : `${item.tmdbVoteCount} vote${item.tmdbVoteCount === 1 ? "" : "s"}`;
}
