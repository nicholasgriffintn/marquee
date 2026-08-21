export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_RATE_LIMITER: RateLimit;
  CURATOR_RATE_LIMITER: RateLimit;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN?: string;
  WATCHMODE_API_KEY?: string;
  AI_GATEWAY_ID: string;
  AI_MODEL: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SITE_ORIGIN?: string;
  TMDB_API_TOKEN?: string;
  INGESTION_QUEUE: Queue<IngestionJob>;
};

export type IngestionJob =
  | { type: "sync-catalog" }
  | { type: "sync-providers" }
  | { type: "enrich-availability"; titleId: string };

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
