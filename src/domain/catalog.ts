import type { ProviderCategory, ProviderIntegration, ProviderStatus } from "./providers";
import { slugify } from "./slug";

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
  tmdbProviderIds: number[];
  stale?: boolean;
};

export type ProviderAvailability = {
  id: string;
  name: string;
  offerTypes: string[];
  webUrl: string | null;
  source: "JustWatch" | "TMDB / JustWatch" | "AniList";
};

export type TitleBuzz = {
  article: string;
  articleUrl: string;
  match: "wikidata" | "search";
  views: number;
  previousViews: number;
  delta: number;
  score: number;
  measuredAt: string;
};

export type TitleForm = {
  colour: string | null;
  aspectRatio: string | null;
};

export type AnimeLink = {
  name: string;
  url: string;
};

export type AnimeTheme = {
  title: string;
  artist: string | null;
  episodes: string | null;
};

export type AnimeStream = {
  site: string;
  url: string;
};

export type AnimeVideo = {
  key: string;
  name: string;
};

export type AnimeStatusBreakdown = {
  watching: number;
  completed: number;
  onHold: number;
  dropped: number;
  planToWatch: number;
};

export type AnimeCharacter = {
  name: string;
  role: string;
  voiceActor: string | null;
};

export type AnimeStaffMember = {
  name: string;
  role: string;
};

export type AnimeRelation = {
  malId: number;
  relation: string;
  format: string | null;
  title: string;
  year: number | null;
};

export type AnimeDetails = {
  format: string | null;
  episodes: number | null;
  durationMinutes: number | null;
  season: string | null;
  seasonYear: number | null;
  source: string | null;
  synonyms: string[];
  romajiTitle: string | null;
  englishTitle: string | null;
  nativeTitle: string | null;
  relations: AnimeRelation[];
  streams?: AnimeStream[];
  characters?: AnimeCharacter[];
  staff?: AnimeStaffMember[];
  broadcast?: string | null;
  airing?: boolean;
  openings?: AnimeTheme[];
  endings?: AnimeTheme[];
  background?: string | null;
  licensors?: string[];
  producers?: string[];
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  keyVisualUrl?: string | null;
  videos?: AnimeVideo[];
  statusBreakdown?: AnimeStatusBreakdown | null;
  recommendations?: number[];
  links?: AnimeLink[];
};

export type CreditPerson = {
  id: number;
  name: string;
  originalName: string | null;
  knownFor: string | null;
  gender: number | null;
  profilePath: string | null;
  popularity: number | null;
};

export type TitleCredit = {
  creditId: string;
  person: CreditPerson;
  department: string;
  job: string | null;
  character: string | null;
  billing: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeCount: number | null;
};

export type TitleCredits = { titleId: string; entries: TitleCredit[] };

export type ExternalIds = {
  imdbId?: string | null;
  tvdbId?: number | null;
  wikidataId?: string | null;
  facebookId?: string | null;
  instagramId?: string | null;
  twitterId?: string | null;
  malId?: number | null;
  anilistId?: number | null;
  anidbId?: number | null;
  kitsuId?: number | null;
  aniSearchId?: number | null;
  animePlanetId?: string | null;
  livechartId?: number | null;
  animeNewsNetworkId?: number | null;
  animeCountdownId?: number | null;
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
  anime?: AnimeDetails;
  people?: string[];
  credits?: TitleCredit[];
  homepage?: string | null;
  originCountries?: string[];
  productionCountries?: string[];
  spokenLanguages?: string[];
  trailerKey?: string | null;
  videos?: { key: string; name: string; type: string }[];
  pending?: boolean;
  originalLanguage?: string | null;
  tagline?: string | null;
  status?: string | null;
  collection?: { id: number; name: string } | null;
  studios?: string[];
  countries?: string[];
  languages?: string[];
  revenue?: number | null;
  budget?: number | null;
  episodeCount?: number | null;
  lastAirDate?: string | null;
  nextAirDate?: string | null;
  recommendationIds?: string[];
  buzz?: TitleBuzz;
  form?: TitleForm;
  ratings?: {
    imdbScore: number | null;
    imdbVotes: number | null;
    rottenTomatoes: string | null;
    metascore: number | null;
    awards?: string | null;
    awardWins?: number | null;
    boxOffice?: number | null;
    animeScore?: number | null;
    animeVotes?: number | null;
  };

  externalIds?: ExternalIds;
};

export type SectionAudience = {
  providerIds?: string[];
};

export type CatalogSection = {
  id: string;
  title: string;
  description: string;
  items: MediaTitle[];
  angle?: string;
  reason?: string;
};

export type CatalogResponse = {
  sections: CatalogSection[];
  source: "TMDB";
  availabilitySource: "JustWatch via TMDB";
  fetchedAt: string;
};

export type FeaturedTitleResponse = {
  item: MediaTitle | null;
  source: "personal" | "trending" | "catalogue" | null;
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

function titleSlug(title: string) {
  return slugify(title) || "title";
}

export function titlePath(item: Pick<MediaTitle, "mediaType" | "tmdbId" | "title">) {
  return `/${item.mediaType}/${item.tmdbId}/${titleSlug(item.title)}`;
}

export function collectionPath(collectionId: number) {
  return `/collection/${collectionId}`;
}

const PERSONAL_SPACING = 3;

export function weaveSections(
  pinned: CatalogSection[],
  curated: CatalogSection[],
  personal: CatalogSection[],
  general: CatalogSection[],
) {
  const seen = new Set<string>();
  const woven: CatalogSection[] = [];
  const queue = [...personal];

  const push = (section: CatalogSection) => {
    if (!seen.has(section.id) && section.items.length > 0) {
      seen.add(section.id);
      woven.push(section);
    }
  };

  for (const section of [...pinned, ...curated]) {
    push(section);
  }

  for (const [index, section] of general.entries()) {
    push(section);

    const next = (index + 1) % PERSONAL_SPACING === 0 ? queue.shift() : undefined;

    if (next) {
      push(next);
    }
  }

  for (const section of queue) {
    push(section);
  }

  return woven;
}
