import type { ExternalIds } from "../src/domain/catalog.ts";
import type { EntryStatus } from "../src/domain/entries.ts";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_RATE_LIMITER: RateLimit;
  CURATOR_RATE_LIMITER: RateLimit;
  CURATOR_FREE_RATE_LIMITER: RateLimit;
  INSIGHT_RATE_LIMITER: RateLimit;
  SEARCH_RATE_LIMITER: RateLimit;
  SEARCH_MEMBER_RATE_LIMITER: RateLimit;
  PUBLIC_RATE_LIMITER: RateLimit;
  MEMBER_RATE_LIMITER: RateLimit;
  WRITE_RATE_LIMITER: RateLimit;
  TELEMETRY_RATE_LIMITER: RateLimit;
  MEDIA_RATE_LIMITER: RateLimit;
  BOT_PROTECTION?: string;
  LOCAL_DEV?: string;
  LOCAL_SYNC?: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN?: string;
  AI_GATEWAY_ID: string;
  AI_MODEL: string;
  AI_FAST_MODEL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  EMAIL?: SendEmail;
  MAIL_FROM?: string;
  SITE_ORIGIN?: string;
  TMDB_API_TOKEN?: string;
  EUROPEANA_API_KEY?: string;
  OMDB_API_KEY?: string;
  AI: Ai;
  VECTORS: Vectorize;
  IMAGES?: ImagesBinding;
  EVENTS?: AnalyticsEngineDataset;
  INGESTION_QUEUE: Queue<IngestionJob>;
  AVAILABILITY_QUEUE: Queue<IngestionJob>;
  RATINGS_QUEUE: Queue<IngestionJob>;
  ANIME_QUEUE: Queue<IngestionJob>;
  POSTER_QUEUE: Queue<IngestionJob>;
  EMBEDDING_QUEUE: Queue<IngestionJob>;
  REVIVAL_QUEUE: Queue<IngestionJob>;
  CATALOG_SWEEP: Workflow<CatalogSweepParameters>;
  RAILS_WORKFLOW: Workflow<{ viewerId: string }>;
  DIGEST_WORKFLOW: Workflow;
  CURATOR_SESSION: DurableObjectNamespace;
  MEDIA: R2Bucket;
  TRAKT_CLIENT_ID?: string;
  TRAKT_CLIENT_SECRET?: string;
};

export type CatalogSweepParameters = { deep?: boolean };

export type EnrichmentSource = "tmdb" | "justwatch" | "omdb" | "poster" | "jikan";

export type TitleRatings = {
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

export type IngestionJob =
  | { type: "sync-catalog" }
  | { type: "sync-providers" }
  | { type: "sync-discover-page"; mediaType: "movie" | "tv"; page: number; partitionId?: string }
  | { type: "measure-discover-partition"; partitionId: string }
  | { type: "enrich-availability"; titleId: string }
  | { type: "enrich-ratings"; titleId: string }
  | { type: "enrich-anime"; titleId: string }
  | { type: "enrich-anilist"; titleId: string }
  | { type: "import-anime-ids"; offset?: number; force?: boolean }
  | { type: "cache-poster"; titleId: string }
  | { type: "import-imdb-title"; imdbId: string }
  | {
      type: "import-diary-row";
      viewerId: string;
      name: string;
      year: number | null;
      rating: number | null;
      watchedAt: string;
    }
  | { type: "embed-titles"; titleIds: string[] }
  | { type: "import-trakt-history"; viewerId: string; origin: string }
  | { type: "push-trakt-shelf"; viewerId: string; origin: string }
  | { type: "sync-schedule" }
  | { type: "sync-buzz" }
  | { type: "sync-cinemas"; source: string }
  | { type: "sync-cinema-screenings"; source: string; siteId: string }
  | {
      type: "sync-revival-source";
      source: "archive" | "loc" | "europeana";
      collection?: string;
      chain?: boolean;
    }
  | { type: "match-revival-works"; chain?: boolean }
  | { type: "check-revival-rights" }
  | { type: "recheck-revival-works" }
  | { type: "mirror-revival-work"; workId: string }
  | { type: "build-sections" };

export type { EntryStatus };

export type ViewingContext = {
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
  updatedAt: string;
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

export type { ExternalIds };
