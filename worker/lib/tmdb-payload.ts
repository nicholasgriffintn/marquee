import type { MediaTitle, MediaType, ProviderAvailability } from "../../src/domain/catalog.ts";
import {
  findRegistryProviderForOffer,
  type ProviderOfferKind,
} from "../../src/domain/providers.ts";
import { httpsUrl } from "./urls.ts";
import { isRecord, numberAt, recordAt, records, stringAt } from "./values.ts";

const IMAGE_BASE = "https://image.tmdb.org/t/p";
const PROVIDER_REGION = "GB";
const OFFER_TYPES: Array<[string, string]> = [
  ["flatrate", "Subscription"],
  ["free", "Free"],
  ["ads", "Free with ads"],
  ["rent", "Rent"],
  ["buy", "Buy"],
];

export type TmdbSummary = { id: number; mediaType: MediaType };

export type TmdbProviderSource = {
  id: number;
  name: string;
  displayPriority: number;
};

function parseAvailability(details: Record<string, unknown>): {
  providers: ProviderAvailability[];
  watchLink: string | null;
} {
  const region = recordAt(recordAt(details["watch/providers"], "results"), PROVIDER_REGION);

  if (!region) {
    return { providers: [], watchLink: null };
  }

  const providers = new Map<string, ProviderAvailability>();

  for (const [field, label] of OFFER_TYPES) {
    for (const item of records(region[field])) {
      const id = numberAt(item, "provider_id");
      const name = stringAt(item, "provider_name");

      if (!id || !name) {
        continue;
      }

      const registry = findRegistryProviderForOffer(name, offerKind(label));
      const providerId = registry?.id ?? `tmdb:${id}`;
      const existing = providers.get(providerId);

      if (existing) {
        if (!existing.offerTypes.includes(label)) {
          existing.offerTypes.push(label);
        }

        continue;
      }

      providers.set(providerId, {
        id: providerId,
        name: registry?.name ?? name,
        offerTypes: [label],
        webUrl: httpsUrl(stringAt(region, "link")),
        source: "TMDB / JustWatch",
      });
    }
  }

  return {
    providers: [...providers.values()],
    watchLink: httpsUrl(stringAt(region, "link")),
  };
}

function parseCertification(mediaType: MediaType, details: Record<string, unknown>) {
  if (mediaType === "tv") {
    const ratings = records(recordAt(details, "content_ratings")?.results);
    const regionalRating = ratings.find((item) => stringAt(item, "rating"));
    const rating = regionalRating ? stringAt(regionalRating, "rating") : null;
    const country = regionalRating ? stringAt(regionalRating, "iso_3166_1") : null;

    return rating ? [country, rating].filter(Boolean).join(" ") : null;
  }

  const releases = records(recordAt(details, "release_dates")?.results);
  const region = releases.find((item) =>
    records(item.release_dates).some((release) => stringAt(release, "certification")),
  );
  const release = region
    ? records(region.release_dates).find((item) => stringAt(item, "certification"))
    : null;
  const rating = release ? stringAt(release, "certification") : null;
  const country = region ? stringAt(region, "iso_3166_1") : null;

  return rating ? [country, rating].filter(Boolean).join(" ") : null;
}

function offerKind(label: string): ProviderOfferKind {
  if (label === "Subscription") {
    return "subscription";
  }

  if (label === "Free" || label === "Free with ads") {
    return "free";
  }

  if (label === "Rent") {
    return "rent";
  }

  if (label === "Buy") {
    return "buy";
  }

  return "other";
}

function imageUrl(path: string | null, size: string) {
  return path?.startsWith("/") ? `${IMAGE_BASE}/${size}${path}` : null;
}

const KEYWORD_LIMIT = 24;
const CAST_LIMIT = 6;

function names(value: unknown, limit: number) {
  return records(value)
    .map((item) => stringAt(item, "name"))
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim().slice(0, 80))
    .slice(0, limit);
}

function parseKeywords(details: Record<string, unknown>) {
  const container = recordAt(details, "keywords");

  if (!container) {
    return [];
  }

  const entries = names(container.keywords ?? container.results, KEYWORD_LIMIT);

  return [...new Set(entries.map((keyword) => keyword.toLowerCase()))];
}

function parsePeople(mediaType: MediaType, details: Record<string, unknown>) {
  const credits = recordAt(details, mediaType === "movie" ? "credits" : "aggregate_credits");
  const directors = credits
    ? records(credits.crew)
        .filter((member) => {
          const job = stringAt(member, "job");

          return (
            job === "Director" ||
            job === "Creator" ||
            records(member.jobs).some((entry) => stringAt(entry, "job") === "Director")
          );
        })
        .map((member) => stringAt(member, "name"))
        .filter((name): name is string => Boolean(name))
        .slice(0, 3)
    : [];
  const creators = names(details.created_by, 3);
  const cast = credits ? names(credits.cast, CAST_LIMIT) : [];

  return [...new Set([...directors, ...creators, ...cast])].slice(0, 10);
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

export function parseTmdbTitle(mediaType: MediaType, value: unknown): MediaTitle | null {
  if (!isRecord(value)) {
    return null;
  }

  const tmdbId = numberAt(value, "id");
  const title = stringAt(value, mediaType === "movie" ? "title" : "name");

  if (!tmdbId || !title) {
    return null;
  }

  const releaseDate = cleanDate(
    stringAt(value, mediaType === "movie" ? "release_date" : "first_air_date"),
  );
  const voteCount = numberAt(value, "vote_count") ?? 0;
  const voteAverage = numberAt(value, "vote_average");
  const { providers, watchLink } = parseAvailability(value);
  const externalIds = recordAt(value, "external_ids");
  const imdbId = externalIds ? stringAt(externalIds, "imdb_id") : null;
  const episodeRunTimes = Array.isArray(value.episode_run_time)
    ? value.episode_run_time.filter((item): item is number => typeof item === "number" && item > 0)
    : [];

  return {
    id: `${mediaType}:${tmdbId}`,
    tmdbId,
    mediaType,
    title,
    originalTitle:
      stringAt(value, mediaType === "movie" ? "original_title" : "original_name") ?? title,
    overview: stringAt(value, "overview") ?? "",
    releaseDate,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    runtimeMinutes:
      mediaType === "movie" ? numberAt(value, "runtime") : (episodeRunTimes[0] ?? null),
    numberOfSeasons: mediaType === "tv" ? numberAt(value, "number_of_seasons") : null,
    genres: records(value.genres)
      .map((genre) => stringAt(genre, "name"))
      .filter((name): name is string => Boolean(name)),
    certification: parseCertification(mediaType, value),
    tmdbScore: voteCount > 0 && voteAverage !== null ? Math.round(voteAverage * 10) / 10 : null,
    tmdbVoteCount: voteCount,
    popularity: numberAt(value, "popularity") ?? 0,
    posterUrl: imageUrl(stringAt(value, "poster_path"), "w500"),
    backdropUrl: imageUrl(stringAt(value, "backdrop_path"), "w1280"),
    providers,
    watchLink,
    tmdbUrl: `https://www.themoviedb.org/${mediaType}/${tmdbId}`,
    imdbUrl: imdbId && /^tt\d+$/u.test(imdbId) ? `https://www.imdb.com/title/${imdbId}/` : null,
    keywords: parseKeywords(value),
    people: parsePeople(mediaType, value),
  };
}

export function parseTmdbSummaries(value: unknown, defaultMediaType?: MediaType) {
  if (!isRecord(value)) {
    return [];
  }

  return records(value.results).flatMap((item): TmdbSummary[] => {
    const id = numberAt(item, "id");
    const mediaType = stringAt(item, "media_type") ?? defaultMediaType;

    return id && (mediaType === "movie" || mediaType === "tv") ? [{ id, mediaType }] : [];
  });
}

export function parseTmdbProviders(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return records(value.results).flatMap((item): TmdbProviderSource[] => {
    const id = numberAt(item, "provider_id");
    const name = stringAt(item, "provider_name");

    if (!id || !name) {
      return [];
    }

    const priorities = recordAt(item, "display_priorities");
    const displayPriority = priorities
      ? (numberAt(priorities, PROVIDER_REGION) ?? numberAt(item, "display_priority") ?? 999)
      : (numberAt(item, "display_priority") ?? 999);

    return [{ id, name, displayPriority }];
  });
}
