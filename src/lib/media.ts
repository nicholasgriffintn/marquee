import type { MediaTitle } from "../domain/catalog";

const POSTER_WIDTHS = [160, 320, 500, 780];
const TMDB_POSTER_SIZES = [92, 154, 185, 342, 500, 780];
const TMDB_BACKDROP_SIZES = [300, 780, 1280];
const PRODUCTION_HOST = "marquee.pashi.app";

function nearest(sizes: number[], width: number) {
  return sizes.find((size) => size >= width) ?? sizes[sizes.length - 1];
}

function cachedArtwork(url: string, width: number) {
  const resolvedWidth = nearest(POSTER_WIDTHS, width);

  if (window.location.hostname !== PRODUCTION_HOST) {
    return `${url}?w=${resolvedWidth}`;
  }

  return `/cdn-cgi/image/width=${resolvedWidth},fit=scale-down,format=auto${url}`;
}

export function artwork(url: string | null, width: number, kind: "poster" | "backdrop" = "poster") {
  if (!url) {
    return null;
  }

  if (url.startsWith("/media/")) {
    return cachedArtwork(url, width);
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

export function moneyLabel(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}bn`;
  }

  return value >= 1_000_000 ? `$${Math.round(value / 1_000_000)}m` : `$${value.toLocaleString()}`;
}

export function compactCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  }

  return value >= 1_000 ? `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k` : `${value}`;
}

export function changeLabel(delta: number) {
  const percent = Math.round(delta * 100);

  return `${percent >= 0 ? "+" : ""}${percent.toLocaleString()}%`;
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
