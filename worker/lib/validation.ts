import type { CuratorCandidate, ProviderAvailability } from "../../src/domain/catalog.ts";
import { isEntryStatus } from "../../src/domain/entries.ts";
import { providerRegistryIds } from "../../src/domain/providers.ts";
import { isArchiveCollection } from "../clients/archive.ts";
import { isCinemaSourceId } from "../clients/cinema/index.ts";
import { isEuropeanaCountry } from "../clients/europeana.ts";
import { isPartitionId } from "../repositories/discover.ts";
import { isRevivalId, isRevivalSource } from "../repositories/revival.ts";
import type { IngestionJob, ViewingContext } from "../types.ts";
import { isRecord } from "./values.ts";

export { isEntryStatus };

export function validProviderIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" &&
          (providerRegistryIds.has(id) || /^tmdb:[1-9]\d{0,9}$/u.test(id)),
      ),
    ),
  ].slice(0, 500);
}

export function isKnownTitle(value: unknown): value is string {
  return typeof value === "string" && /^(movie|tv):[1-9]\d{0,9}$/u.test(value);
}

export function isIngestionJob(value: unknown): value is IngestionJob {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "sync-catalog" || value.type === "sync-providers") {
    return true;
  }

  if (value.type === "sync-discover-page") {
    return (
      (value.mediaType === "movie" || value.mediaType === "tv") &&
      typeof value.page === "number" &&
      Number.isInteger(value.page) &&
      value.page >= 1 &&
      value.page <= 500 &&
      (value.partitionId === undefined || isPartitionId(value.partitionId))
    );
  }

  if (value.type === "measure-discover-partition") {
    return isPartitionId(value.partitionId);
  }

  if (
    value.type === "sync-schedule" ||
    value.type === "sync-buzz" ||
    value.type === "match-revival-works" ||
    value.type === "check-revival-rights" ||
    value.type === "recheck-revival-works" ||
    value.type === "build-sections"
  ) {
    return true;
  }

  if (value.type === "sync-revival-source") {
    if (!isRevivalSource(value.source)) {
      return false;
    }

    if (value.chain !== undefined && typeof value.chain !== "boolean") {
      return false;
    }

    if (value.collection === undefined) {
      return true;
    }

    return value.source === "europeana"
      ? isEuropeanaCountry(value.collection)
      : isArchiveCollection(value.collection);
  }

  if (value.type === "mirror-revival-work") {
    return isRevivalId(value.workId);
  }

  if (value.type === "sync-cinemas") {
    return isCinemaSourceId(value.source);
  }

  if (value.type === "sync-cinema-screenings") {
    return (
      isCinemaSourceId(value.source) &&
      typeof value.siteId === "string" &&
      /^[\w-]{1,32}$/u.test(value.siteId)
    );
  }

  if (value.type === "import-trakt-history" || value.type === "push-trakt-shelf") {
    return (
      typeof value.viewerId === "string" &&
      value.viewerId.length > 0 &&
      value.viewerId.length <= 128 &&
      typeof value.origin === "string" &&
      value.origin.startsWith("http")
    );
  }

  if (value.type === "embed-titles") {
    return (
      Array.isArray(value.titleIds) &&
      value.titleIds.length > 0 &&
      value.titleIds.length <= 100 &&
      value.titleIds.every(isKnownTitle)
    );
  }

  if (value.type === "import-imdb-title") {
    return typeof value.imdbId === "string" && /^tt\d+$/u.test(value.imdbId);
  }

  if (value.type === "import-diary-row") {
    return (
      typeof value.viewerId === "string" &&
      typeof value.name === "string" &&
      value.name.length > 0 &&
      value.name.length <= 160
    );
  }

  if (value.type === "match-revival-works") {
    return value.chain === undefined || typeof value.chain === "boolean";
  }

  if (value.type === "import-anime-ids") {
    const offsetOk =
      value.offset === undefined ||
      (typeof value.offset === "number" && Number.isInteger(value.offset) && value.offset >= 0);

    return offsetOk && (value.force === undefined || typeof value.force === "boolean");
  }

  if (
    value.type === "enrich-availability" ||
    value.type === "enrich-ratings" ||
    value.type === "enrich-anilist" ||
    value.type === "cache-poster"
  ) {
    return isKnownTitle(value.titleId);
  }

  return false;
}

export function viewingContext(value: unknown): ViewingContext[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 100).flatMap((entry): ViewingContext[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const candidate = entry;

    if (!isKnownTitle(candidate.titleId) || !isEntryStatus(candidate.status)) {
      return [];
    }

    const rating = Number(candidate.rating);

    return [
      {
        titleId: candidate.titleId,
        status: candidate.status,
        rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
        thoughts:
          typeof candidate.thoughts === "string" ? candidate.thoughts.trim().slice(0, 500) : "",
        updatedAt:
          typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
      },
    ];
  });
}

export function curatorCandidates(value: unknown): CuratorCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 30).flatMap((item): CuratorCandidate[] => {
    if (!isRecord(item) || !isKnownTitle(item.id) || typeof item.title !== "string") {
      return [];
    }

    const mediaType = item.id.startsWith("movie:") ? "movie" : "tv";
    const genres = Array.isArray(item.genres)
      ? item.genres.filter((genre): genre is string => typeof genre === "string").slice(0, 10)
      : [];
    const providers: ProviderAvailability[] = Array.isArray(item.providers)
      ? item.providers
          .flatMap((provider): ProviderAvailability[] => {
            if (
              !isRecord(provider) ||
              typeof provider.id !== "string" ||
              typeof provider.name !== "string"
            ) {
              return [];
            }

            const offerTypes = Array.isArray(provider.offerTypes)
              ? provider.offerTypes
                  .filter((offer): offer is string => typeof offer === "string")
                  .slice(0, 5)
              : [];

            return [
              {
                id: provider.id,
                name: provider.name.slice(0, 100),
                offerTypes,
                webUrl: null,
                source: provider.source === "JustWatch" ? "JustWatch" : "TMDB / JustWatch",
              },
            ];
          })
          .slice(0, 20)
      : [];

    return [
      {
        id: item.id,
        title: item.title.trim().slice(0, 200),
        mediaType,
        year: typeof item.year === "number" && Number.isInteger(item.year) ? item.year : null,
        genres,
        providers,
        tmdbScore:
          typeof item.tmdbScore === "number" && Number.isFinite(item.tmdbScore)
            ? item.tmdbScore
            : null,
        tmdbVoteCount:
          typeof item.tmdbVoteCount === "number" && Number.isInteger(item.tmdbVoteCount)
            ? item.tmdbVoteCount
            : 0,
        overview: typeof item.overview === "string" ? item.overview.trim().slice(0, 1_000) : "",
      },
    ];
  });
}
