import type {
  CatalogResponse,
  ExternalIds,
  MediaTitle,
  ProviderAvailability,
  TitleCredit,
  TitleCredits,
} from "../../src/domain/catalog.ts";
import { EXTERNAL_ID_FIELDS, EXTERNAL_ID_OWNERS } from "../../src/domain/catalog.ts";
import { mergeLanguageCodes } from "../../src/domain/languages.ts";
import { computeBlendedRating, computeWeightedRating } from "../lib/ratings.ts";
import { retryTransient } from "../lib/retry.ts";
import { READ_CHUNK, rowPlaceholders } from "./catalog-array-utils.ts";
import { persistTitleExtensions } from "./catalog-arrays.ts";
import { projectTitles } from "./catalog-index.ts";
import { readRawItems } from "./catalog-reader.ts";
import { recountPersonTitles } from "./people.ts";

const KEYWORD_LIMIT = 40;

export const EXTERNAL_PROVIDER_SOURCES = new Set<ProviderAvailability["source"]>(["JustWatch"]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      // oxlint-disable-next-line unicorn/no-array-sort
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

function mergeProviders(fresh: MediaTitle, stored: MediaTitle) {
  const providers = new Map(fresh.providers.map((provider) => [provider.id, provider]));

  for (const provider of stored.providers) {
    if (!EXTERNAL_PROVIDER_SOURCES.has(provider.source)) {
      continue;
    }

    const existing = providers.get(provider.id);
    const audioLanguages = mergeLanguageCodes(existing?.audioLanguages, provider.audioLanguages);
    const subtitleLanguages = mergeLanguageCodes(
      existing?.subtitleLanguages,
      provider.subtitleLanguages,
    );

    providers.set(
      provider.id,
      existing
        ? {
            ...provider,
            offerTypes: [...new Set([...existing.offerTypes, ...provider.offerTypes])],
            ...(audioLanguages.length > 0 ? { audioLanguages } : {}),
            ...(subtitleLanguages.length > 0 ? { subtitleLanguages } : {}),
            webUrl: provider.webUrl ?? existing.webUrl,
          }
        : provider,
    );
  }

  return [...providers.values()];
}

function mergeExternalIds(fresh: MediaTitle, stored: MediaTitle) {
  if (!fresh.externalIds && !stored.externalIds) {
    return undefined;
  }

  const merged: ExternalIds = {};

  for (const field of EXTERNAL_ID_FIELDS) {
    const freshValue = fresh.externalIds?.[field];
    const storedValue = stored.externalIds?.[field];

    (merged as Record<string, unknown>)[field] =
      EXTERNAL_ID_OWNERS[field] === "enrichment"
        ? (storedValue ?? freshValue ?? null)
        : (freshValue ?? storedValue ?? null);
  }

  return merged;
}

function mergeWithStored(fresh: MediaTitle, stored: MediaTitle | null): MediaTitle {
  if (!stored) {
    return fresh;
  }

  return {
    ...fresh,
    overview: fresh.overview.trim() ? fresh.overview : stored.overview,
    releaseDate: fresh.releaseDate ?? stored.releaseDate,
    year: fresh.year ?? stored.year,
    runtimeMinutes: fresh.runtimeMinutes ?? stored.runtimeMinutes,
    numberOfSeasons: fresh.numberOfSeasons ?? stored.numberOfSeasons,
    genres: fresh.genres.length > 0 ? fresh.genres : stored.genres,
    certification: fresh.certification ?? stored.certification,
    posterUrl: fresh.posterUrl ?? stored.posterUrl,
    backdropUrl: fresh.backdropUrl ?? stored.backdropUrl,
    tmdbScore: fresh.tmdbScore ?? stored.tmdbScore,
    people: fresh.people?.length ? fresh.people : stored.people,
    credits: fresh.credits?.length ? fresh.credits : stored.credits,
    studios: fresh.studios?.length ? fresh.studios : stored.studios,
    countries: fresh.countries?.length ? fresh.countries : stored.countries,
    languages: fresh.languages?.length ? fresh.languages : stored.languages,
    originCountries: fresh.originCountries?.length ? fresh.originCountries : stored.originCountries,
    productionCountries: fresh.productionCountries?.length
      ? fresh.productionCountries
      : stored.productionCountries,
    spokenLanguages: fresh.spokenLanguages?.length ? fresh.spokenLanguages : stored.spokenLanguages,
    videos: fresh.videos?.length ? fresh.videos : stored.videos,
    recommendationIds: fresh.recommendationIds?.length
      ? fresh.recommendationIds
      : stored.recommendationIds,
    providers: mergeProviders(fresh, stored),
    watchLink: fresh.watchLink ?? stored.watchLink,
    homepage: fresh.homepage ?? stored.homepage,
    trailerKey: fresh.trailerKey ?? stored.trailerKey,
    tagline: fresh.tagline ?? stored.tagline,
    budget: fresh.budget ?? stored.budget,
    episodeCount: fresh.episodeCount ?? stored.episodeCount,
    lastAirDate: fresh.lastAirDate ?? stored.lastAirDate,
    nextAirDate: fresh.nextAirDate ?? stored.nextAirDate,
    pending: fresh.pending ?? stored.pending,
    keywords: [...new Set([...(fresh.keywords ?? []), ...(stored.keywords ?? [])])].slice(
      0,
      KEYWORD_LIMIT,
    ),
    ratings: stored.ratings ?? fresh.ratings,
    externalIds: mergeExternalIds(fresh, stored),
    status: fresh.status ?? stored.status,
    anime: fresh.anime ?? stored.anime,
  };
}

export async function storeCatalog(db: Database, catalogue: CatalogResponse) {
  const titles = [
    ...new Map(
      catalogue.sections.flatMap((section) => section.items).map((title) => [title.id, title]),
    ).values(),
  ];

  await storeItems(db, titles, catalogue.fetchedAt);

  return titles;
}

const PEOPLE_ROWS_PER_STATEMENT = 12; // 12 * 7 columns = 84 bound params
const CREDIT_ROWS_PER_STATEMENT = 9; // 9 * 10 columns = 90 bound params
const STATEMENTS_PER_BATCH = 10;
const DEADLOCK_ATTEMPTS = 3;
const PEOPLE_CHUNK = PEOPLE_ROWS_PER_STATEMENT * STATEMENTS_PER_BATCH;
const CREDIT_CHUNK = CREDIT_ROWS_PER_STATEMENT * STATEMENTS_PER_BATCH;

function upsertPeople(transaction: DatabaseTransaction, who: TitleCredit["person"][]) {
  const placeholders = rowPlaceholders(who.length, 7);
  const params = who.flatMap((person) => [
    person.id,
    person.name,
    person.originalName,
    person.knownFor,
    person.gender,
    person.profilePath,
    person.popularity,
  ]);

  return transaction.execute(
    `INSERT INTO catalog_people
         (person_id, name, original_name, known_for, gender, profile_path, popularity)
       VALUES ${placeholders}
       ON CONFLICT(person_id) DO UPDATE SET
         name = excluded.name,
         original_name = excluded.original_name,
         known_for = excluded.known_for,
         gender = excluded.gender,
         profile_path = excluded.profile_path,
         popularity = excluded.popularity
       WHERE catalog_people.name IS DISTINCT FROM excluded.name
          OR catalog_people.original_name IS DISTINCT FROM excluded.original_name
          OR catalog_people.known_for IS DISTINCT FROM excluded.known_for
          OR catalog_people.gender IS DISTINCT FROM excluded.gender
          OR catalog_people.profile_path IS DISTINCT FROM excluded.profile_path
          OR catalog_people.popularity IS DISTINCT FROM excluded.popularity`,
    [...params],
  );
}

function upsertCredits(
  transaction: DatabaseTransaction,
  rows: { titleId: string; entry: TitleCredit }[],
) {
  const placeholders = rowPlaceholders(rows.length, 10);
  const params = rows.flatMap(({ titleId, entry }) => [
    entry.creditId,
    titleId,
    entry.person.id,
    entry.department,
    entry.job,
    entry.character,
    entry.billing,
    entry.seasonNumber,
    entry.episodeNumber,
    entry.episodeCount,
  ]);

  return transaction.execute(
    `INSERT INTO catalog_credits
         (credit_id, title_id, person_id, department, job, character, billing,
          season_number, episode_number, episode_count)
       VALUES ${placeholders}
       ON CONFLICT(credit_id) DO UPDATE SET
         title_id = excluded.title_id,
         person_id = excluded.person_id,
         department = excluded.department,
         job = excluded.job,
         character = excluded.character,
         billing = excluded.billing,
         season_number = excluded.season_number,
         episode_number = excluded.episode_number,
         episode_count = excluded.episode_count
       WHERE catalog_credits.title_id IS DISTINCT FROM excluded.title_id
          OR catalog_credits.person_id IS DISTINCT FROM excluded.person_id
          OR catalog_credits.department IS DISTINCT FROM excluded.department
          OR catalog_credits.job IS DISTINCT FROM excluded.job
          OR catalog_credits.character IS DISTINCT FROM excluded.character
          OR catalog_credits.billing IS DISTINCT FROM excluded.billing
          OR catalog_credits.season_number IS DISTINCT FROM excluded.season_number
          OR catalog_credits.episode_number IS DISTINCT FROM excluded.episode_number
          OR catalog_credits.episode_count IS DISTINCT FROM excluded.episode_count`,
    [...params],
  );
}

export async function storePeople(db: Database, who: TitleCredit["person"][]) {
  const roster = [...new Map(who.map((person) => [person.id, person])).values()].toSorted(
    (left, right) => left.id - right.id,
  );

  for (let index = 0; index < roster.length; index += PEOPLE_CHUNK) {
    const chunk = roster.slice(index, index + PEOPLE_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      for (let offset = 0; offset < chunk.length; offset += PEOPLE_ROWS_PER_STATEMENT) {
        // oxlint-disable-next-line no-await-in-loop
        await upsertPeople(transaction, chunk.slice(offset, offset + PEOPLE_ROWS_PER_STATEMENT));
      }
    });
  }

  return roster.length;
}

export async function storeCredits(db: Database, credits: TitleCredits[]) {
  const entriesByCreditId = new Map<string, { titleId: string; entry: TitleCredit }>();

  for (const title of credits) {
    for (const entry of title.entries) {
      entriesByCreditId.set(entry.creditId, { titleId: title.titleId, entry });
    }
  }

  const entries = [...entriesByCreditId.values()];

  if (entries.length === 0) {
    return 0;
  }

  const people = new Map<number, TitleCredit["person"]>();

  for (const { entry } of entries) {
    people.set(entry.person.id, entry.person);
  }

  const roster = [...people.values()].toSorted((left, right) => left.id - right.id);
  const orderedEntries = entries.toSorted((left, right) =>
    left.entry.creditId.localeCompare(right.entry.creditId),
  );

  for (let index = 0; index < roster.length; index += PEOPLE_CHUNK) {
    const chunk = roster.slice(index, index + PEOPLE_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    await retryTransient(
      () =>
        db.transaction(async (transaction) => {
          for (let offset = 0; offset < chunk.length; offset += PEOPLE_ROWS_PER_STATEMENT) {
            // oxlint-disable-next-line no-await-in-loop
            await upsertPeople(
              transaction,
              chunk.slice(offset, offset + PEOPLE_ROWS_PER_STATEMENT),
            );
          }
        }),
      DEADLOCK_ATTEMPTS,
    );
  }

  for (let index = 0; index < orderedEntries.length; index += CREDIT_CHUNK) {
    const chunk = orderedEntries.slice(index, index + CREDIT_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    await retryTransient(
      () =>
        db.transaction(async (transaction) => {
          for (let offset = 0; offset < chunk.length; offset += CREDIT_ROWS_PER_STATEMENT) {
            // oxlint-disable-next-line no-await-in-loop
            await upsertCredits(
              transaction,
              chunk.slice(offset, offset + CREDIT_ROWS_PER_STATEMENT),
            );
          }
        }),
      DEADLOCK_ATTEMPTS,
    );
  }

  await recountPersonTitles(
    db,
    entries.map(({ entry }) => entry.person.id),
  );

  return entries.length;
}

export async function storeItems(db: Database, items: MediaTitle[], sourceUpdatedAt: string) {
  if (items.length === 0) {
    return;
  }

  const unique = [...new Map(items.map((title) => [title.id, title])).values()];
  const stored = await readRawItems(
    db,
    unique.map((title) => title.id),
  );
  const changed = unique.flatMap((title) => {
    const previous = stored.get(title.id) ?? null;
    const merged = mergeWithStored(title, previous);

    return previous && canonical(merged) === canonical(previous) ? [] : [merged];
  });

  if (changed.length === 0) {
    return;
  }

  for (let index = 0; index < changed.length; index += READ_CHUNK) {
    const wave = changed.slice(index, index + READ_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    await persistTitleExtensions(db, wave);
    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      for (const title of wave) {
        // oxlint-disable-next-line no-await-in-loop
        await upsertTitle(transaction, title, sourceUpdatedAt);
      }
    });
    // oxlint-disable-next-line no-await-in-loop
    await projectTitles(
      db,
      wave.map((title) => title.id),
    );
  }

  await storeCredits(
    db,
    changed.flatMap((title) =>
      title.credits?.length ? [{ titleId: title.id, entries: title.credits }] : [],
    ),
  );
}

export function titleScalarColumns(title: MediaTitle) {
  return {
    overview: title.overview,
    runtimeMinutes: title.runtimeMinutes,
    numberOfSeasons: title.numberOfSeasons,
    releaseDate: title.releaseDate,
    certification: title.certification,
    tmdbScore: title.tmdbScore,
    posterUrl: title.posterUrl,
    backdropUrl: title.backdropUrl,
    watchLink: title.watchLink,
    status: title.status ?? null,
    originalLanguage: title.originalLanguage ?? null,
    revenue: title.revenue ?? null,
    collectionId: title.collection?.id ?? null,
    collectionName: title.collection?.name ?? null,
    malId: title.externalIds?.malId ?? null,
    anilistId: title.externalIds?.anilistId ?? null,
    wikidataId: title.externalIds?.wikidataId ?? null,
  };
}

function upsertTitle(transaction: DatabaseTransaction, title: MediaTitle, sourceUpdatedAt: string) {
  const scalars = titleScalarColumns(title);

  return transaction.execute(
    `INSERT INTO catalog_titles
         (id, media_type, tmdb_id, title, original_title, year, popularity,
          source_updated_at, imdb_id, vote_count, weighted_rating, blended_rating,
          overview, runtime_minutes, number_of_seasons, release_date, certification,
          tmdb_score, poster_url, backdrop_url, watch_link, status, original_language,
          revenue, collection_id, collection_name, mal_id, anilist_id, wikidata_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
       ON CONFLICT(id) DO UPDATE SET
         media_type = excluded.media_type,
         tmdb_id = excluded.tmdb_id,
         title = excluded.title,
         original_title = excluded.original_title,
         year = excluded.year,
         popularity = excluded.popularity,
         source_updated_at = excluded.source_updated_at,
         imdb_id = excluded.imdb_id,
         vote_count = excluded.vote_count,
         weighted_rating = excluded.weighted_rating,
         blended_rating = excluded.blended_rating,
         overview = excluded.overview,
         runtime_minutes = excluded.runtime_minutes,
         number_of_seasons = excluded.number_of_seasons,
         release_date = excluded.release_date,
         certification = excluded.certification,
         tmdb_score = excluded.tmdb_score,
         poster_url = excluded.poster_url,
         backdrop_url = excluded.backdrop_url,
         watch_link = excluded.watch_link,
         status = excluded.status,
         original_language = excluded.original_language,
         revenue = excluded.revenue,
         collection_id = excluded.collection_id,
         collection_name = excluded.collection_name,
         mal_id = excluded.mal_id,
         anilist_id = excluded.anilist_id,
         wikidata_id = excluded.wikidata_id,
         updated_at = CURRENT_TIMESTAMP`,
    [
      title.id,
      title.mediaType,
      title.tmdbId,
      title.title,
      title.originalTitle,
      title.year,
      title.popularity,
      sourceUpdatedAt,
      title.imdbUrl ? (/\/(tt\d+)/u.exec(title.imdbUrl)?.[1] ?? null) : null,
      Math.max(0, title.tmdbVoteCount),
      computeWeightedRating(title),
      computeBlendedRating(title),
      scalars.overview,
      scalars.runtimeMinutes,
      scalars.numberOfSeasons,
      scalars.releaseDate,
      scalars.certification,
      scalars.tmdbScore,
      scalars.posterUrl,
      scalars.backdropUrl,
      scalars.watchLink,
      scalars.status,
      scalars.originalLanguage,
      scalars.revenue,
      scalars.collectionId,
      scalars.collectionName,
      scalars.malId,
      scalars.anilistId,
      scalars.wikidataId,
    ],
  );
}
