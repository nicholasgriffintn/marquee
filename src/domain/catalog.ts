import type { ProviderCategory, ProviderIntegration, ProviderStatus } from "./providers";

export type MediaType = "movie" | "tv";

export type Provider = {
  id: string;
  mark: string;
  name: string;
  category: ProviderCategory;
  integration: ProviderIntegration;
  status: ProviderStatus;
  sourceLabel: string;
  displayPriority: number;
  homepage: string | null;
  watchmodeSourceIds: number[];
  tmdbProviderIds: number[];
};

export type ProviderAvailability = {
  id: string;
  name: string;
  offerTypes: string[];
  webUrl: string | null;
  source: "Watchmode" | "TMDB / JustWatch";
};

export type MediaTitle = {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string | null;
  year: number | null;
  runtimeMinutes: number | null;
  numberOfSeasons: number | null;
  genres: string[];
  certification: string | null;
  tmdbScore: number | null;
  tmdbVoteCount: number;
  popularity: number;
  posterUrl: string | null;
  backdropUrl: string | null;
  providers: ProviderAvailability[];
  watchLink: string | null;
  tmdbUrl: string;
  imdbUrl: string | null;
  keywords?: string[];
  people?: string[];
  trailerKey?: string | null;
  pending?: boolean;
  ratings?: {
    imdbScore: number | null;
    imdbVotes: number | null;
    rottenTomatoes: string | null;
    metascore: number | null;
  };

  externalIds?: {
    simklId: number | null;
    imdbId: string | null;
    tvdbId: number | null;
    malId: number | null;
    anilistId: number | null;
  };
};

export type CatalogSection = {
  id: string;
  title: string;
  description: string;
  items: MediaTitle[];
};

export type CatalogResponse = {
  sections: CatalogSection[];
  source: "TMDB";
  availabilitySource: "JustWatch via TMDB";
  fetchedAt: string;
};

export type ProvidersResponse = {
  providers: Provider[];
  region: "GB";
  sources: string[];
  errors: string[];
  stats: {
    configured: number;
    feeds: number;
    links: number;
    markers: number;
    longTail: number;
  };
  fetchedAt: string;
};

export type CuratorCandidate = Pick<
  MediaTitle,
  | "id"
  | "title"
  | "mediaType"
  | "year"
  | "genres"
  | "providers"
  | "tmdbScore"
  | "tmdbVoteCount"
  | "overview"
>;
