import type { MediaTitle } from "../domain/catalog";

const POSTER_WIDTHS = [160, 320, 500, 780];
const TMDB_POSTER_SIZES = [92, 154, 185, 342, 500, 780];
const TMDB_BACKDROP_SIZES = [300, 780, 1280];

function nearest(sizes: number[], width: number) {
  return sizes.find((size) => size >= width) ?? sizes[sizes.length - 1];
}

export function artwork(url: string | null, width: number, kind: "poster" | "backdrop" = "poster") {
  if (!url) {
    return null;
  }

  if (url.startsWith("/media/")) {
    return `${url}?w=${nearest(POSTER_WIDTHS, width)}`;
  }

  const sizes = kind === "poster" ? TMDB_POSTER_SIZES : TMDB_BACKDROP_SIZES;

  return url.replace(/\/t\/p\/w\d+\//u, `/t/p/w${nearest(sizes, width)}/`);
}

export function artworkSrcSet(
  url: string | null,
  width: number,
  kind: "poster" | "backdrop" = "poster",
) {
  const single = artwork(url, width, kind);
  const retina = artwork(url, width * 2, kind);

  return single && retina && single !== retina ? `${single} 1x, ${retina} 2x` : undefined;
}

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
