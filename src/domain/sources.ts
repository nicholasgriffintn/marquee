export type UpstreamSourceId =
  | "tmdb"
  | "justwatch"
  | "omdb"
  | "mal"
  | "anilist"
  | "fribb"
  | "tvmaze"
  | "wikimedia"
  | "wikipedia"
  | "wikidata"
  | "commons"
  | "archive"
  | "loc"
  | "europeana"
  | "trakt"
  | "cineworld"
  | "picturehouse"
  | "vue"
  | "overpass"
  | "ai-gateway"
  | "cloudflare-analytics"
  | "mirror";

export type UpstreamSourceKind =
  | "catalogue"
  | "availability"
  | "metadata"
  | "archive"
  | "cinema"
  | "account"
  | "platform";

export type UpstreamBackoffPolicy = { baseMinutes: number; capMinutes: number };

export type UpstreamSourceConfig = {
  id: UpstreamSourceId;
  label: string;
  kind: UpstreamSourceKind;
  powers: string;
  credential: string | null;
  optional: boolean;
  window: "day" | "month";
  callLimit: number;
  enforced: boolean;
  rateLimited: UpstreamBackoffPolicy;
  refused: UpstreamBackoffPolicy;
};

const WEEK_MINUTES = 60 * 24 * 7;

const REFUSED_UNTIL_FIXED: UpstreamBackoffPolicy = {
  baseMinutes: WEEK_MINUTES,
  capMinutes: WEEK_MINUTES,
};

const STEADY: UpstreamBackoffPolicy = { baseMinutes: 30, capMinutes: 60 * 6 };

const source = (
  config: Omit<UpstreamSourceConfig, "rateLimited" | "refused"> &
    Partial<Pick<UpstreamSourceConfig, "rateLimited" | "refused">>,
): UpstreamSourceConfig => ({
  rateLimited: STEADY,
  refused: REFUSED_UNTIL_FIXED,
  ...config,
});

export const UPSTREAM_SOURCES: Record<UpstreamSourceId, UpstreamSourceConfig> = {
  tmdb: source({
    id: "tmdb",
    label: "TMDB",
    kind: "catalogue",
    powers: "Titles, artwork, credits and the provider directory",
    credential: "TMDB_API_TOKEN",
    optional: false,
    window: "day",
    callLimit: 12_000,
    enforced: true,
  }),
  justwatch: source({
    id: "justwatch",
    label: "JustWatch",
    kind: "availability",
    powers: "Every piece of streaming availability and the package directory",
    credential: null,
    optional: false,
    window: "day",
    callLimit: 20_000,
    enforced: true,
  }),
  omdb: source({
    id: "omdb",
    label: "OMDb",
    kind: "metadata",
    powers: "Ratings, awards, box office, episodes and poster fallbacks",
    credential: "OMDB_API_KEY",
    optional: true,
    window: "day",
    callLimit: 500_000,
    enforced: true,
    rateLimited: { baseMinutes: 10, capMinutes: 60 * 6 },
  }),
  mal: source({
    id: "mal",
    label: "MyAnimeList",
    kind: "metadata",
    powers: "Anime formats, seasons and watch order",
    credential: "MAL_CLIENT_ID",
    optional: true,
    window: "day",
    callLimit: 20_000,
    enforced: true,
    rateLimited: { baseMinutes: 60, capMinutes: 60 * 12 },
  }),
  anilist: source({
    id: "anilist",
    label: "AniList",
    kind: "metadata",
    powers: "Anime streaming links, cast and relations",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 20_000,
    enforced: true,
    refused: { baseMinutes: 60, capMinutes: 60 * 12 },
  }),
  fribb: source({
    id: "fribb",
    label: "Fribb's anime lists",
    kind: "metadata",
    powers: "The map between anime databases",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 200,
    enforced: false,
  }),
  tvmaze: source({
    id: "tvmaze",
    label: "TVmaze",
    kind: "metadata",
    powers: "Air dates and episode schedules",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
  wikimedia: source({
    id: "wikimedia",
    label: "Wikimedia pageviews",
    kind: "metadata",
    powers: "The trending rail and the world board",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 40_000,
    enforced: false,
  }),
  wikipedia: source({
    id: "wikipedia",
    label: "Wikipedia",
    kind: "metadata",
    powers: "Revival house descriptions, with attribution",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 20_000,
    enforced: false,
  }),
  wikidata: source({
    id: "wikidata",
    label: "Wikidata",
    kind: "metadata",
    powers: "Identifiers, awards, source works, places and UK rights checks",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 10_000,
    enforced: false,
  }),
  commons: source({
    id: "commons",
    label: "Wikimedia Commons",
    kind: "archive",
    powers: "Revival prints held by the Commons community",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 10_000,
    enforced: false,
  }),
  archive: source({
    id: "archive",
    label: "Internet Archive",
    kind: "archive",
    powers: "Most of the prints in the revival house",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 10_000,
    enforced: false,
  }),
  loc: source({
    id: "loc",
    label: "Library of Congress",
    kind: "archive",
    powers: "Revival prints held by the nation",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
  europeana: source({
    id: "europeana",
    label: "Europeana",
    kind: "archive",
    powers: "British and European prints for the revival house",
    credential: "EUROPEANA_API_KEY",
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
  trakt: source({
    id: "trakt",
    label: "Trakt",
    kind: "account",
    powers: "Importing and pushing a viewer's watch history",
    credential: "TRAKT_CLIENT_ID",
    optional: true,
    window: "day",
    callLimit: 10_000,
    enforced: false,
  }),
  cineworld: source({
    id: "cineworld",
    label: "Cineworld",
    kind: "cinema",
    powers: "Cineworld sites and showtimes",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
  picturehouse: source({
    id: "picturehouse",
    label: "Picturehouse",
    kind: "cinema",
    powers: "Picturehouse sites and showtimes",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
  vue: source({
    id: "vue",
    label: "Vue",
    kind: "cinema",
    powers: "Vue sites and showtimes",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
  overpass: source({
    id: "overpass",
    label: "OpenStreetMap Overpass",
    kind: "cinema",
    powers: "Where the cinemas actually are",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 500,
    enforced: false,
    rateLimited: { baseMinutes: 60, capMinutes: 60 * 12 },
  }),
  "ai-gateway": source({
    id: "ai-gateway",
    label: "AI Gateway",
    kind: "platform",
    powers: "The curator, the usher, rail copy and every other model call",
    credential: "AI_GATEWAY_TOKEN",
    optional: true,
    window: "day",
    callLimit: 20_000,
    enforced: false,
  }),
  "cloudflare-analytics": source({
    id: "cloudflare-analytics",
    label: "Analytics Engine",
    kind: "platform",
    powers: "Reading back the event stream behind the quality board",
    credential: "CLOUDFLARE_API_TOKEN",
    optional: true,
    window: "day",
    callLimit: 2_000,
    enforced: false,
  }),
  mirror: source({
    id: "mirror",
    label: "Print mirroring",
    kind: "archive",
    powers: "Copying approved public-domain prints into our own bucket",
    credential: null,
    optional: true,
    window: "day",
    callLimit: 5_000,
    enforced: false,
  }),
};

export const UPSTREAM_SOURCE_IDS = Object.keys(UPSTREAM_SOURCES) as UpstreamSourceId[];

export function isUpstreamSource(value: string): value is UpstreamSourceId {
  return Object.hasOwn(UPSTREAM_SOURCES, value);
}

export function upstreamSourceLabel(id: string) {
  return isUpstreamSource(id) ? UPSTREAM_SOURCES[id].label : id;
}
