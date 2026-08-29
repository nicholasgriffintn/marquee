import type {
  ExternalIds,
  MediaTitle,
  MediaType,
  ProviderAvailability,
  TitleCredit,
  TitleCredits,
} from "../../src/domain/catalog.ts";
import {
  findRegistryProviderForOffer,
  type ProviderOfferKind,
} from "../../src/domain/providers.ts";
import type { Episode, SeasonDetail, SeasonSummary } from "../../src/domain/seasons.ts";
import { httpsUrl } from "./urls.ts";
import {
  calendarDate,
  isRecord,
  numberAt,
  positiveNumber,
  recordAt,
  records,
  stringAt,
  stringList,
} from "./values.ts";

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
const KEYWORD_DENYLIST = new Set([
  "aftercreditsstinger",
  "duringcreditsstinger",
  "woman director",
  "based on novel or book",
  "live action remake",
]);
const CAST_LIMIT = 6;

function names(value: unknown, limit: number) {
  return records(value)
    .map((item) => stringAt(item, "name"))
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim().slice(0, 80))
    .slice(0, limit);
}

const VIDEO_TYPES = ["Trailer", "Teaser", "Clip", "Featurette"];
const VIDEO_LIMIT = 5;

function parseVideos(details: Record<string, unknown>) {
  const videos = records(recordAt(details, "videos")?.results).filter((video) => {
    const type = stringAt(video, "type");

    return (
      stringAt(video, "site") === "YouTube" &&
      stringAt(video, "key") &&
      type &&
      VIDEO_TYPES.includes(type)
    );
  });

  // oxlint-disable-next-line unicorn/no-array-sort
  const ordered = [...videos].sort((left, right) => {
    const rank = (video: Record<string, unknown>) =>
      VIDEO_TYPES.indexOf(stringAt(video, "type") ?? "") + (video.official === true ? 0 : 0.5);

    return rank(left) - rank(right);
  });

  return ordered.slice(0, VIDEO_LIMIT).flatMap((video) => {
    const key = stringAt(video, "key");
    const type = stringAt(video, "type");

    return key && type ? [{ key, name: (stringAt(video, "name") ?? type).slice(0, 80), type }] : [];
  });
}

function parseTrailer(details: Record<string, unknown>) {
  const videos = records(recordAt(details, "videos")?.results).filter(
    (video) => stringAt(video, "site") === "YouTube" && stringAt(video, "key"),
  );
  const best =
    videos.find((video) => stringAt(video, "type") === "Trailer" && video.official === true) ??
    videos.find((video) => stringAt(video, "type") === "Trailer") ??
    videos.find((video) => stringAt(video, "type") === "Teaser");

  return best ? stringAt(best, "key") : null;
}

function parseExternalIds(value: Record<string, unknown> | null, imdbId: string | null) {
  const wikidataId = value ? stringAt(value, "wikidata_id") : null;
  const ids: ExternalIds = {
    ...(imdbId && /^tt\d+$/u.test(imdbId) ? { imdbId } : {}),
    ...(value && numberAt(value, "tvdb_id") ? { tvdbId: numberAt(value, "tvdb_id") } : {}),
    ...(wikidataId && /^Q\d+$/u.test(wikidataId) ? { wikidataId } : {}),
    ...(value && stringAt(value, "facebook_id")
      ? { facebookId: stringAt(value, "facebook_id") }
      : {}),
    ...(value && stringAt(value, "instagram_id")
      ? { instagramId: stringAt(value, "instagram_id") }
      : {}),
    ...(value && stringAt(value, "twitter_id") ? { twitterId: stringAt(value, "twitter_id") } : {}),
  };

  return Object.keys(ids).length > 0 ? ids : undefined;
}

function parseKeywords(details: Record<string, unknown>) {
  const container = recordAt(details, "keywords");

  if (!container) {
    return [];
  }

  const entries = names(container.keywords ?? container.results, KEYWORD_LIMIT * 2);

  return [...new Set(entries.map((keyword) => keyword.toLowerCase()))]
    .filter((keyword) => !KEYWORD_DENYLIST.has(keyword))
    .slice(0, KEYWORD_LIMIT);
}

function billed(value: unknown, limit: number) {
  return records(value)
    .flatMap((member) => {
      const name = stringAt(member, "name");
      const id = numberAt(member, "id");

      return name && id ? [{ id, name }] : [];
    })
    .slice(0, limit);
}

export function parseTmdbPerson(value: unknown) {
  return isRecord(value) ? person(value) : null;
}

function person(member: Record<string, unknown>) {
  const id = numberAt(member, "id");
  const name = stringAt(member, "name");

  return id && name
    ? {
        id,
        name,
        originalName: stringAt(member, "original_name"),
        knownFor: stringAt(member, "known_for_department"),
        gender: numberAt(member, "gender"),
        profilePath: stringAt(member, "profile_path"),
        popularity: numberAt(member, "popularity"),
      }
    : null;
}

const CREDITED_CAST = 60;

const KEY_CREW = new Set([
  "Director",
  "Co-Director",
  "Writer",
  "Screenplay",
  "Story",
  "Novel",
  "Characters",
  "Adaptation",
  "Author",
  "Creator",
  "Producer",
  "Executive Producer",
  "Casting",
  "Director of Photography",
  "Editor",
  "Original Music Composer",
  "Music",
  "Production Design",
  "Art Direction",
  "Costume Design",
  "Makeup Designer",
  "Visual Effects Supervisor",
]);

export function parseTmdbCredits(mediaType: MediaType, value: unknown): TitleCredits | null {
  if (!isRecord(value)) {
    return null;
  }

  const tmdbId = numberAt(value, "id");
  const credits = recordAt(value, mediaType === "movie" ? "credits" : "aggregate_credits");

  if (!tmdbId || !credits) {
    return null;
  }

  const cast = records(credits.cast)
    .slice(0, CREDITED_CAST)
    .flatMap((member, index) => {
      const who = person(member);
      const creditId = stringAt(member, "credit_id") ?? firstJobCreditId(member);

      return who && creditId
        ? [
            {
              creditId,
              person: who,
              department: "Acting",
              job: null,
              character: stringAt(member, "character") ?? firstCharacter(member),
              billing: numberAt(member, "order") ?? index,
              seasonNumber: null,
              episodeNumber: null,
              episodeCount: numberAt(member, "total_episode_count") ?? episodesOf(member),
            },
          ]
        : [];
    });
  const crew = records(credits.crew).flatMap((member) => {
    const who = person(member);
    const jobs = records(member.jobs);

    if (!who) {
      return [];
    }

    if (jobs.length > 0) {
      return jobs.flatMap((entry) => {
        const creditId = stringAt(entry, "credit_id");
        const job = stringAt(entry, "job");

        return creditId && job && KEY_CREW.has(job)
          ? [
              {
                creditId,
                person: who,
                department: stringAt(member, "department") ?? "Crew",
                job,
                character: null,
                billing: null,
                seasonNumber: null,
                episodeNumber: null,
                episodeCount: numberAt(entry, "episode_count"),
              },
            ]
          : [];
      });
    }

    const creditId = stringAt(member, "credit_id");
    const job = stringAt(member, "job");

    return creditId && job && KEY_CREW.has(job)
      ? [
          {
            creditId,
            person: who,
            department: stringAt(member, "department") ?? "Crew",
            job,
            character: null,
            billing: null,
            seasonNumber: null,
            episodeNumber: null,
            episodeCount: null,
          },
        ]
      : [];
  });

  return { titleId: `${mediaType}:${tmdbId}`, entries: [...cast, ...crew] };
}

function episodesOf(member: Record<string, unknown>) {
  const roles = records(member.roles);

  return roles.length > 0
    ? roles.reduce((sum, role) => sum + (numberAt(role, "episode_count") ?? 0), 0)
    : null;
}

export function parseTmdbSeasonCredits(titleId: string, value: unknown): TitleCredits | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = records(value.episodes).flatMap((episode) => {
    const seasonNumber = numberAt(episode, "season_number");
    const episodeNumber = numberAt(episode, "episode_number");

    if (seasonNumber === null || episodeNumber === null) {
      return [];
    }

    const crew = records(episode.crew).flatMap((member): TitleCredit[] => {
      const who = person(member);
      const creditId = stringAt(member, "credit_id");
      const job = stringAt(member, "job");

      return who && creditId && job && KEY_CREW.has(job)
        ? [
            {
              creditId,
              person: who,
              department: stringAt(member, "department") ?? "Crew",
              job,
              character: null,
              billing: null,
              seasonNumber,
              episodeNumber,
              episodeCount: null,
            },
          ]
        : [];
    });
    const guests = records(episode.guest_stars).flatMap((member, index): TitleCredit[] => {
      const who = person(member);
      const creditId = stringAt(member, "credit_id");

      return who && creditId
        ? [
            {
              creditId,
              person: who,
              department: "Acting",
              job: null,
              character: stringAt(member, "character"),
              billing: numberAt(member, "order") ?? index,
              seasonNumber,
              episodeNumber,
              episodeCount: null,
            },
          ]
        : [];
    });

    return crew.concat(guests);
  });

  return entries.length > 0 ? { titleId, entries } : null;
}

function firstCharacter(member: Record<string, unknown>) {
  const [role] = records(member.roles);

  return role ? stringAt(role, "character") : null;
}

function firstJobCreditId(member: Record<string, unknown>) {
  const [role] = records(member.roles);

  return role ? stringAt(role, "credit_id") : null;
}

function parsePeople(mediaType: MediaType, details: Record<string, unknown>) {
  const credits = recordAt(details, mediaType === "movie" ? "credits" : "aggregate_credits");
  const directors = credits
    ? billed(
        records(credits.crew).filter((member) => {
          const job = stringAt(member, "job");

          return (
            job === "Director" ||
            job === "Creator" ||
            records(member.jobs).some((entry) => stringAt(entry, "job") === "Director")
          );
        }),
        3,
      )
    : [];
  const creators = billed(details.created_by, 3);
  const cast = credits ? billed(credits.cast, CAST_LIMIT) : [];
  const seen = new Map<number, { id: number; name: string }>();

  for (const candidate of [...directors, ...creators, ...cast]) {
    if (!seen.has(candidate.id)) {
      seen.set(candidate.id, candidate);
    }
  }

  return [...seen.values()].slice(0, 10);
}

const STUDIO_LIMIT = 4;
const RECOMMENDATION_LIMIT = 12;

function parseStudios(mediaType: MediaType, details: Record<string, unknown>) {
  return names(
    mediaType === "movie" ? details.production_companies : details.networks,
    STUDIO_LIMIT,
  );
}

function parseCollection(details: Record<string, unknown>) {
  const collection = recordAt(details, "belongs_to_collection");
  const id = collection ? numberAt(collection, "id") : null;
  const name = collection ? stringAt(collection, "name") : null;

  return id && name ? { id, name: name.replace(/\s+Collection$/u, "") } : null;
}

function parseRecommendations(details: Record<string, unknown>) {
  return records(recordAt(details, "recommendations")?.results)
    .flatMap((item): string[] => {
      const id = numberAt(item, "id");
      const type = stringAt(item, "media_type");

      return id && (type === "movie" || type === "tv") ? [`${type}:${id}`] : [];
    })
    .slice(0, RECOMMENDATION_LIMIT);
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

  const releaseDate = calendarDate(
    stringAt(value, mediaType === "movie" ? "release_date" : "first_air_date"),
  );
  const voteCount = numberAt(value, "vote_count") ?? 0;
  const voteAverage = numberAt(value, "vote_average");
  const { providers, watchLink } = parseAvailability(value);
  const externalIds = recordAt(value, "external_ids");
  const imdbId = externalIds ? stringAt(externalIds, "imdb_id") : null;
  const billing = parsePeople(mediaType, value);
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
    externalIds: parseExternalIds(externalIds, imdbId),
    homepage: httpsUrl(stringAt(value, "homepage")),
    originCountries: stringList(value.origin_country, {
      limit: 6,
      itemLength: 8,
    }),
    productionCountries: records(value.production_countries)
      .flatMap((entry) => [stringAt(entry, "name")].filter(Boolean))
      .slice(0, 6) as string[],
    spokenLanguages: records(value.spoken_languages)
      .flatMap((entry) =>
        [stringAt(entry, "english_name") ?? stringAt(entry, "name")].filter(Boolean),
      )
      .slice(0, 8) as string[],
    keywords: parseKeywords(value),
    people: billing.map((credited) => credited.name),
    credits: parseTmdbCredits(mediaType, value)?.entries ?? [],
    trailerKey: parseTrailer(value),
    videos: parseVideos(value),
    originalLanguage: stringAt(value, "original_language"),
    tagline: stringAt(value, "tagline")?.trim().slice(0, 200) || null,
    status: stringAt(value, "status"),
    collection: mediaType === "movie" ? parseCollection(value) : null,
    studios: parseStudios(mediaType, value),
    revenue: mediaType === "movie" ? positiveNumber(numberAt(value, "revenue")) : null,
    budget: mediaType === "movie" ? positiveNumber(numberAt(value, "budget")) : null,
    episodeCount: mediaType === "tv" ? positiveNumber(numberAt(value, "number_of_episodes")) : null,
    lastAirDate: mediaType === "tv" ? calendarDate(stringAt(value, "last_air_date")) : null,
    nextAirDate:
      mediaType === "tv"
        ? calendarDate(stringAt(recordAt(value, "next_episode_to_air") ?? {}, "air_date"))
        : null,
    recommendationIds: parseRecommendations(value),
  };
}

const EPISODE_OVERVIEW_LIMIT = 1_200;
const SEASON_OVERVIEW_LIMIT = 1_200;

export function parseTmdbSeasonSummaries(value: unknown): SeasonSummary[] {
  if (!isRecord(value)) {
    return [];
  }

  return records(value.seasons).flatMap((season): SeasonSummary[] => {
    const seasonNumber = numberAt(season, "season_number");

    if (seasonNumber === null || seasonNumber < 0) {
      return [];
    }

    return [
      {
        seasonNumber,
        name: stringAt(season, "name") ?? `Season ${seasonNumber}`,
        overview: (stringAt(season, "overview") ?? "").slice(0, SEASON_OVERVIEW_LIMIT),
        airDate: calendarDate(stringAt(season, "air_date")),
        episodeCount: Math.max(0, numberAt(season, "episode_count") ?? 0),
        posterUrl: imageUrl(stringAt(season, "poster_path"), "w342"),
      },
    ];
  });
}

function parseTmdbEpisode(seasonNumber: number, value: Record<string, unknown>): Episode[] {
  const episodeNumber = numberAt(value, "episode_number");
  const name = stringAt(value, "name");

  if (episodeNumber === null || episodeNumber < 0) {
    return [];
  }

  const voteCount = Math.max(0, numberAt(value, "vote_count") ?? 0);
  const voteAverage = numberAt(value, "vote_average");
  const runtime = numberAt(value, "runtime");

  return [
    {
      seasonNumber: numberAt(value, "season_number") ?? seasonNumber,
      episodeNumber,
      name: name?.trim() || `Episode ${episodeNumber}`,
      overview: (stringAt(value, "overview") ?? "").slice(0, EPISODE_OVERVIEW_LIMIT),
      airDate: calendarDate(stringAt(value, "air_date")),
      runtimeMinutes: runtime !== null && runtime > 0 ? runtime : null,
      stillUrl: imageUrl(stringAt(value, "still_path"), "w300"),
      tmdbScore: voteCount > 0 && voteAverage ? Math.round(voteAverage * 10) / 10 : null,
      tmdbVoteCount: voteCount,
    },
  ];
}

export function parseTmdbSeason(
  seasonNumber: number,
  value: unknown,
): Omit<SeasonDetail, "source" | "fetchedAt"> | null {
  if (!isRecord(value)) {
    return null;
  }

  const episodes = records(value.episodes)
    .flatMap((episode) => parseTmdbEpisode(seasonNumber, episode))
    .toSorted((left, right) => left.episodeNumber - right.episodeNumber);

  return {
    seasonNumber: numberAt(value, "season_number") ?? seasonNumber,
    name: stringAt(value, "name") ?? `Season ${seasonNumber}`,
    overview: (stringAt(value, "overview") ?? "").slice(0, SEASON_OVERVIEW_LIMIT),
    airDate: calendarDate(stringAt(value, "air_date")),
    episodeCount: episodes.length,
    posterUrl: imageUrl(stringAt(value, "poster_path"), "w342"),
    episodes,
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
