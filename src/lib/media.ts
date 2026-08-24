import { animeMeta } from "../domain/anime";
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
  const anime = animeMeta(item);
  const values = [
    anime.year ?? item.year?.toString(),
    item.certification,
    item.mediaType === "movie"
      ? item.runtimeMinutes
        ? `${item.runtimeMinutes} min`
        : null
      : item.numberOfSeasons
        ? `${item.numberOfSeasons} season${item.numberOfSeasons === 1 ? "" : "s"}${
            item.episodeCount ? `, ${item.episodeCount} episodes` : ""
          }`
        : null,
    item.genres.slice(0, 2).join(" / ") || null,
  ];

  return values.filter(Boolean).join(" · ");
}

const RUN_STATUS: Record<string, string> = {
  "Returning Series": "Returning",
  "In Production": "In production",
  Canceled: "Cancelled",
  Cancelled: "Cancelled",
  Ended: "Ended",
  Planned: "Planned",
  Pilot: "Pilot",
};

export function runStatusLabel(item: MediaTitle) {
  if (item.mediaType !== "tv" || !item.status) {
    return null;
  }

  return RUN_STATUS[item.status] ?? item.status;
}

export function detailMeta(item: MediaTitle) {
  if (item.mediaType === "movie") {
    return mediaMeta(item);
  }

  const anime = animeMeta(item);
  const values = [
    anime.year ?? item.year?.toString(),
    item.certification,
    runStatusLabel(item),
    item.numberOfSeasons
      ? `${item.numberOfSeasons} season${item.numberOfSeasons === 1 ? "" : "s"}`
      : null,
    item.episodeCount ? `${item.episodeCount} episodes` : null,
    ...anime.extras,
    item.genres.slice(0, 2).join(" / ") || null,
  ];

  return values.filter(Boolean).join(" · ");
}

export function languageLabel(code: string | null | undefined) {
  if (!code || code === "en") {
    return null;
  }

  try {
    const names = new Intl.DisplayNames(["en-GB"], { type: "language" });

    return names.of(code) ?? null;
  } catch {
    return null;
  }
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

export function heroTitleClass(title: string) {
  if (title.length > 46) {
    return "hero-title hero-title-tiny";
  }

  if (title.length > 26) {
    return "hero-title hero-title-small";
  }

  return "hero-title";
}

export function scoreLabel(item: MediaTitle) {
  return item.tmdbScore === null ? "Not yet rated" : `${item.tmdbScore.toFixed(1)} / 10`;
}

export function votesLabel(count: number) {
  if (count <= 0) {
    return "";
  }

  return count >= 1_000 ? `${compactCount(count)} votes` : `${count} vote${count === 1 ? "" : "s"}`;
}
