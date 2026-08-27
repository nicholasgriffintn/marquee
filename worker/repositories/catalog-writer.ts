import type {
  CatalogResponse,
  MediaTitle,
  ProviderAvailability,
  TitleCredit,
  TitleCredits,
} from "../../src/domain/catalog.ts";
import { computeBlendedRating, computeWeightedRating } from "../lib/ratings.ts";
import { readRawItems } from "./catalog-reader.ts";

const READ_CHUNK = 80;
const KEYWORD_LIMIT = 40;

const EXTERNAL_PROVIDER_SOURCES = new Set<ProviderAvailability["source"]>([
  "JustWatch",
]);

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
  const providers = new Map(
    fresh.providers.map((provider) => [provider.id, provider]),
  );

  for (const provider of stored.providers) {
    if (!EXTERNAL_PROVIDER_SOURCES.has(provider.source)) {
      continue;
    }

    const existing = providers.get(provider.id);

    providers.set(
      provider.id,
      existing
        ? {
            ...provider,
            offerTypes: [
              ...new Set([...existing.offerTypes, ...provider.offerTypes]),
            ],
            webUrl: provider.webUrl ?? existing.webUrl,
          }
        : provider,
    );
  }

  return [...providers.values()];
}

function mergeWithStored(
  fresh: MediaTitle,
  stored: MediaTitle | null,
): MediaTitle {
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
    people: fresh.people?.length ? fresh.people : stored.people,
    credits: fresh.credits?.length ? fresh.credits : stored.credits,
    studios: fresh.studios?.length ? fresh.studios : stored.studios,
    countries: fresh.countries?.length ? fresh.countries : stored.countries,
    languages: fresh.languages?.length ? fresh.languages : stored.languages,
    providers: mergeProviders(fresh, stored),
    watchLink: fresh.watchLink ?? stored.watchLink,
    keywords: [
      ...new Set([...(fresh.keywords ?? []), ...(stored.keywords ?? [])]),
    ].slice(0, KEYWORD_LIMIT),
    ratings: stored.ratings ?? fresh.ratings,
    externalIds: mergeExternalIds(fresh, stored),
    status: fresh.status ?? stored.status,
    lastAirDate: fresh.lastAirDate ?? stored.lastAirDate,
    trailerKey: fresh.trailerKey ?? stored.trailerKey,
    anime: fresh.anime ?? stored.anime,
  };
}

function mergeExternalIds(fresh: MediaTitle, stored: MediaTitle) {
  if (!fresh.externalIds && !stored.externalIds) {
    return undefined;
  }

  return {
    imdbId: fresh.externalIds?.imdbId ?? stored.externalIds?.imdbId ?? null,
    tvdbId: fresh.externalIds?.tvdbId ?? stored.externalIds?.tvdbId ?? null,
    wikidataId:
      fresh.externalIds?.wikidataId ?? stored.externalIds?.wikidataId ?? null,
    malId: stored.externalIds?.malId ?? fresh.externalIds?.malId ?? null,
    anilistId:
      stored.externalIds?.anilistId ?? fresh.externalIds?.anilistId ?? null,
  };
}

export async function storeCatalog(db: D1Database, catalogue: CatalogResponse) {
  const titles = [
    ...new Map(
      catalogue.sections
        .flatMap((section) => section.items)
        .map((title) => [title.id, title]),
    ).values(),
  ];

  await storeItems(db, titles, catalogue.fetchedAt);

  return titles;
}

// D1 rejects statements with more than 100 bound parameters
// (https://developers.cloudflare.com/d1/platform/limits/), so each multi-row
// VALUES statement must keep columns * rows comfortably under that ceiling.
const PEOPLE_ROWS_PER_STATEMENT = 12; // 12 * 7 columns = 84 bound params
const CREDIT_ROWS_PER_STATEMENT = 9; // 9 * 10 columns = 90 bound params
const STATEMENTS_PER_BATCH = 10;
const PEOPLE_CHUNK = PEOPLE_ROWS_PER_STATEMENT * STATEMENTS_PER_BATCH;
const CREDIT_CHUNK = CREDIT_ROWS_PER_STATEMENT * STATEMENTS_PER_BATCH;

function upsertPeopleStatement(db: D1Database, who: TitleCredit["person"][]) {
  const placeholders = who.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
  const params = who.flatMap((person) => [
    person.id,
    person.name,
    person.originalName,
    person.knownFor,
    person.gender,
    person.profilePath,
    person.popularity,
  ]);

  return db
    .prepare(
      `INSERT INTO catalog_people
         (person_id, name, original_name, known_for, gender, profile_path, popularity)
       VALUES ${placeholders}
       ON CONFLICT(person_id) DO UPDATE SET
         name = excluded.name,
         original_name = excluded.original_name,
         known_for = excluded.known_for,
         gender = excluded.gender,
         profile_path = excluded.profile_path,
         popularity = excluded.popularity`,
    )
    .bind(...params);
}

function upsertCreditsStatement(
  db: D1Database,
  rows: { titleId: string; entry: TitleCredit }[],
) {
  const placeholders = rows
    .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .join(", ");
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

  return db
    .prepare(
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
         episode_count = excluded.episode_count`,
    )
    .bind(...params);
}

export async function storeCredits(db: D1Database, credits: TitleCredits[]) {
  const entries = credits.flatMap((title) =>
    title.entries.map((entry) => ({ titleId: title.titleId, entry })),
  );

  if (entries.length === 0) {
    return 0;
  }

  const people = new Map<number, TitleCredit["person"]>();

  for (const { entry } of entries) {
    people.set(entry.person.id, entry.person);
  }

  const roster = [...people.values()];

  for (let index = 0; index < roster.length; index += PEOPLE_CHUNK) {
    const chunk = roster.slice(index, index + PEOPLE_CHUNK);
    const statements = [];

    for (
      let offset = 0;
      offset < chunk.length;
      offset += PEOPLE_ROWS_PER_STATEMENT
    ) {
      statements.push(
        upsertPeopleStatement(
          db,
          chunk.slice(offset, offset + PEOPLE_ROWS_PER_STATEMENT),
        ),
      );
    }

    // oxlint-disable-next-line no-await-in-loop
    await db.batch(statements);
  }

  for (let index = 0; index < entries.length; index += CREDIT_CHUNK) {
    const chunk = entries.slice(index, index + CREDIT_CHUNK);
    const statements = [];

    for (
      let offset = 0;
      offset < chunk.length;
      offset += CREDIT_ROWS_PER_STATEMENT
    ) {
      statements.push(
        upsertCreditsStatement(
          db,
          chunk.slice(offset, offset + CREDIT_ROWS_PER_STATEMENT),
        ),
      );
    }

    // oxlint-disable-next-line no-await-in-loop
    await db.batch(statements);
  }

  return entries.length;
}

export async function storeItems(
  db: D1Database,
  items: MediaTitle[],
  sourceUpdatedAt: string,
) {
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

    return previous && canonical(merged) === canonical(previous)
      ? []
      : [merged];
  });

  if (changed.length === 0) {
    return;
  }

  for (let index = 0; index < changed.length; index += READ_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(
      changed
        .slice(index, index + READ_CHUNK)
        .map((title) => upsertTitle(db, title, sourceUpdatedAt)),
    );
  }

  await storeCredits(
    db,
    changed.flatMap((title) =>
      title.credits?.length
        ? [{ titleId: title.id, entries: title.credits }]
        : [],
    ),
  );
}

function withoutCredits(title: MediaTitle) {
  const { credits: _credits, ...rest } = title;

  return rest;
}

function upsertTitle(
  db: D1Database,
  title: MediaTitle,
  sourceUpdatedAt: string,
) {
  return db
    .prepare(
      `INSERT INTO catalog_titles
         (id, media_type, tmdb_id, title, original_title, year, popularity,
          provider_ids, payload, source_updated_at, imdb_id,
          vote_count, weighted_rating, blended_rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         media_type = excluded.media_type,
         tmdb_id = excluded.tmdb_id,
         title = excluded.title,
         original_title = excluded.original_title,
         year = excluded.year,
         popularity = excluded.popularity,
         provider_ids = excluded.provider_ids,
         payload = excluded.payload,
         source_updated_at = excluded.source_updated_at,
         imdb_id = excluded.imdb_id,
         vote_count = excluded.vote_count,
         weighted_rating = excluded.weighted_rating,
         blended_rating = excluded.blended_rating,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      title.id,
      title.mediaType,
      title.tmdbId,
      title.title,
      title.originalTitle,
      title.year,
      title.popularity,
      JSON.stringify(title.providers.map((provider) => provider.id)),
      JSON.stringify(withoutCredits(title)),
      sourceUpdatedAt,
      title.imdbUrl ? (/\/(tt\d+)/u.exec(title.imdbUrl)?.[1] ?? null) : null,
      Math.max(0, title.tmdbVoteCount),
      computeWeightedRating(title),
      computeBlendedRating(title),
    );
}
