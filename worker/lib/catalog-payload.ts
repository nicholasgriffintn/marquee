import type {
  MediaTitle,
  MediaType,
  Provider,
  ProvidersResponse,
  SectionAudience,
} from "../../src/domain/catalog.ts";
import { isKnownTitle } from "./validation.ts";
import { isNullableString, isNumberArray, isRecord, isStringArray, parseJson } from "./values.ts";

export type CatalogTitleRow = {
  id: string;
  media_type: string;
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number | null;
  popularity: number;
  source_updated_at: string;
  enriched_at: string | null;
  updated_at: string;
  imdb_id: string | null;
  poster_key: string | null;
  vote_count: number;
  weighted_rating: number;
  blended_rating: number;
  runtime_minutes: number | null;
  release_date: string | null;
  certification: string | null;
  status: string | null;
  original_language: string | null;
  revenue: number | null;
  collection_id: number | null;
  collection_name: string | null;
  mal_id: number | null;
  anilist_id: number | null;
  wikidata_id: string | null;
  overview: string;
  number_of_seasons: number | null;
  tmdb_score: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  watch_link: string | null;
};

const CATALOG_TITLE_COLUMN_NAMES = [
  "id",
  "media_type",
  "tmdb_id",
  "title",
  "original_title",
  "year",
  "popularity",
  "source_updated_at",
  "enriched_at",
  "updated_at",
  "imdb_id",
  "poster_key",
  "vote_count",
  "weighted_rating",
  "blended_rating",
  "runtime_minutes",
  "release_date",
  "certification",
  "status",
  "original_language",
  "revenue",
  "collection_id",
  "collection_name",
  "mal_id",
  "anilist_id",
  "wikidata_id",
  "overview",
  "number_of_seasons",
  "tmdb_score",
  "poster_url",
  "backdrop_url",
  "watch_link",
];

export const CATALOG_TITLE_COLUMNS = CATALOG_TITLE_COLUMN_NAMES.join(", ");

export function catalogTitleColumns(alias: string) {
  return CATALOG_TITLE_COLUMN_NAMES.map((column) => `${alias}.${column}`).join(", ");
}

function titleUrls(row: Pick<CatalogTitleRow, "media_type" | "tmdb_id" | "imdb_id">) {
  return {
    tmdbUrl: `https://www.themoviedb.org/${row.media_type}/${row.tmdb_id}`,
    imdbUrl: row.imdb_id ? `https://www.imdb.com/title/${row.imdb_id}/` : null,
  };
}

export function buildTitleFromRow(row: CatalogTitleRow): MediaTitle {
  const urls = titleUrls(row);

  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    mediaType: row.media_type as MediaType,
    title: row.title,
    originalTitle: row.original_title,
    overview: row.overview,
    releaseDate: row.release_date,
    year: row.year,
    runtimeMinutes: row.runtime_minutes,
    numberOfSeasons: row.number_of_seasons,
    genres: [],
    certification: row.certification,
    tmdbScore: row.tmdb_score,
    tmdbVoteCount: row.vote_count,
    popularity: row.popularity,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    providers: [],
    watchLink: row.watch_link,
    tmdbUrl: urls.tmdbUrl,
    imdbUrl: urls.imdbUrl,
    keywords: [],
    people: [],
    originalLanguage: row.original_language,
    status: row.status,
    collection:
      row.collection_id !== null && row.collection_name !== null
        ? { id: row.collection_id, name: row.collection_name }
        : null,
    studios: [],
    revenue: row.revenue,
    externalIds: {
      imdbId: row.imdb_id,
      malId: row.mal_id,
      anilistId: row.anilist_id,
      wikidataId: row.wikidata_id,
    },
  };
}

export function withStoredPoster<T extends MediaTitle>(title: T, posterKey?: string | null): T {
  return posterKey ? { ...title, posterUrl: `/media/${posterKey}` } : title;
}

export function parseSectionAudience(value: string | null): SectionAudience {
  const parsed = value ? parseJson(value) : null;

  if (!isRecord(parsed)) {
    return {};
  }

  return isStringArray(parsed.providerIds) ? { providerIds: parsed.providerIds } : {};
}

export function parseStoredTitleIds(value: string) {
  const parsed = parseJson(value);

  return isStringArray(parsed) ? parsed.filter(isKnownTitle) : [];
}

function isProvider(value: unknown): value is Provider {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.mark === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.integration === "string" &&
    typeof value.status === "string" &&
    typeof value.sourceLabel === "string" &&
    typeof value.displayPriority === "number" &&
    isNullableString(value.homepage) &&
    isNumberArray(value.tmdbProviderIds)
  );
}

function isProvidersResponse(value: unknown): value is ProvidersResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.providers) &&
    value.providers.every(isProvider) &&
    value.region === "GB" &&
    isStringArray(value.sources) &&
    isStringArray(value.errors) &&
    isRecord(value.stats) &&
    typeof value.stats.configured === "number" &&
    typeof value.stats.feeds === "number" &&
    typeof value.stats.links === "number" &&
    typeof value.stats.markers === "number" &&
    typeof value.stats.longTail === "number" &&
    typeof value.fetchedAt === "string"
  );
}

export function parseStoredProviders(value: string) {
  const parsed = parseJson(value);

  return isProvidersResponse(parsed) ? parsed : null;
}
