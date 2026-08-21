export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_RATE_LIMITER: RateLimit;
  CURATOR_RATE_LIMITER: RateLimit;
  SEARCH_RATE_LIMITER: RateLimit;
  SEARCH_MEMBER_RATE_LIMITER: RateLimit;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN?: string;
  WATCHMODE_API_KEY?: string;
  AI_GATEWAY_ID: string;
  AI_MODEL: string;
  AI_FAST_MODEL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SITE_ORIGIN?: string;
  TMDB_API_TOKEN?: string;
  OMDB_API_KEY?: string;
  SIMKL_CLIENT_ID?: string;
  INGESTION_QUEUE: Queue<IngestionJob>;
  AVAILABILITY_QUEUE: Queue<IngestionJob>;
  RATINGS_QUEUE: Queue<IngestionJob>;
  SIMKL_QUEUE: Queue<IngestionJob>;
  POSTER_QUEUE: Queue<IngestionJob>;
  MEDIA: R2Bucket;
};

export type EnrichmentSource = "watchmode" | "omdb" | "poster" | "simkl";

export type TitleRatings = {
  imdbScore: number | null;
  imdbVotes: number | null;
  rottenTomatoes: string | null;
  metascore: number | null;
};

export type ExternalIds = {
  simklId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  malId: number | null;
  anilistId: number | null;
};

export type IngestionJob =
  | { type: "sync-catalog" }
  | { type: "sync-providers" }
  | { type: "sync-discover-page"; mediaType: "movie" | "tv"; page: number }
  | { type: "enrich-availability"; titleId: string }
  | { type: "enrich-ratings"; titleId: string }
  | { type: "enrich-simkl"; titleId: string }
  | { type: "cache-poster"; titleId: string }
  | { type: "import-imdb-title"; imdbId: string };

export type EntryStatus = "watchlist" | "watching" | "watched" | "dropped";

export type ViewingContext = {
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
};

export type ViewerContext = {
  entries: ViewingContext[];
  selectedProviderIds: string[];
};

export type CuratorResult = {
  titleIds: string[];
  summary: string;
  reasons: Record<string, string>;
};
