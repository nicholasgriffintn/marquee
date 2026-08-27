import type { AnimeDetails, MediaTitle, ProviderAvailability } from "./catalog";
import { findRegistryProvider } from "./providers";

const FORMATS: Record<string, string> = {
  TV: "TV series",
  "TV Special": "TV special",
  OVA: "OVA",
  ONA: "ONA",
  Movie: "Film",
  Special: "Special",
  Music: "Music video",
};

const SOURCES: Record<string, string> = {
  Manga: "from a manga",
  "Light novel": "from a light novel",
  "Visual novel": "from a visual novel",
  Novel: "from a novel",
  Original: "an original story",
  Game: "from a game",
  "Web manga": "from a web manga",
  "4-koma manga": "from a 4-koma",
  "Picture book": "from a picture book",
};

const WATCH_ORDER: Record<string, string> = {
  Prequel: "Before this",
  Sequel: "After this",
  "Parent story": "Part of",
  "Side story": "Alongside",
  "Spin-off": "Spin-off",
  "Alternative version": "Another version",
  "Alternative setting": "Another setting",
  Summary: "Recap",
};

const SUBSCRIPTION = "Subscription";
const IMPLIED_FORMATS = new Set(["TV", "Movie"]);

export function animeSeasonLabel(anime: AnimeDetails) {
  if (!anime.season || !anime.seasonYear) {
    return null;
  }

  return `${anime.season.charAt(0)}${anime.season.slice(1).toLowerCase()} ${anime.seasonYear}`;
}

export function animeMeta(item: MediaTitle) {
  const anime = item.anime;

  if (!anime) {
    return { year: null, extras: [] };
  }

  const format = anime.format && !IMPLIED_FORMATS.has(anime.format) ? FORMATS[anime.format] : null;

  return {
    year: animeSeasonLabel(anime),
    extras: [
      format ?? null,
      item.mediaType === "tv" && anime.durationMinutes
        ? `${anime.durationMinutes} min episodes`
        : null,
      anime.source ? (SOURCES[anime.source] ?? null) : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

const BEFORE = new Set(["Prequel", "Parent story"]);
const AFTER = new Set(["Sequel"]);

export function watchOrderLabel(relation: string) {
  return WATCH_ORDER[relation] ?? relation;
}

export function watchOrderCaption(relation: string, item: MediaTitle) {
  const canonical = relation === "Prequel" || relation === "Sequel";

  return [canonical ? null : watchOrderLabel(relation), item.year?.toString()]
    .filter(Boolean)
    .join(" · ");
}

export function watchOrderPlacement(relation: string) {
  if (BEFORE.has(relation)) {
    return "before" as const;
  }

  return AFTER.has(relation) ? ("after" as const) : ("related" as const);
}

const FALLBACK_SOURCE = "TMDB / JustWatch";

export function mergeAnimeProviders(item: MediaTitle, providers: ProviderAvailability[]) {
  const merged = new Map(providers.map((provider) => [provider.id, provider]));

  for (const stream of item.anime?.streams ?? []) {
    const registered = findRegistryProvider(stream.site);
    const id =
      registered?.id ?? `anilist:${stream.site.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`;
    const existing = merged.get(id);

    if (existing && existing.source !== FALLBACK_SOURCE) {
      continue;
    }

    merged.set(id, {
      id,
      name: registered?.name ?? stream.site,
      offerTypes: [SUBSCRIPTION],
      webUrl: stream.url,
      source: "AniList",
    });
  }

  return [...merged.values()];
}
