import type {
  CatalogResponse,
  MediaTitle,
  ProviderAvailability,
} from "../../src/domain/catalog.ts";
import { readRawItems } from "./catalog-reader.ts";

const READ_CHUNK = 80;
const KEYWORD_LIMIT = 40;

const EXTERNAL_PROVIDER_SOURCES = new Set<ProviderAvailability["source"]>(["JustWatch"]);

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

    providers.set(
      provider.id,
      existing
        ? {
            ...provider,
            offerTypes: [...new Set([...existing.offerTypes, ...provider.offerTypes])],
            webUrl: provider.webUrl ?? existing.webUrl,
          }
        : provider,
    );
  }

  return [...providers.values()];
}

function mergeWithStored(fresh: MediaTitle, stored: MediaTitle | null): MediaTitle {
  if (!stored) {
    return fresh;
  }

  return {
    ...fresh,
    providers: mergeProviders(fresh, stored),
    watchLink: fresh.watchLink ?? stored.watchLink,
    keywords: [...new Set([...(fresh.keywords ?? []), ...(stored.keywords ?? [])])].slice(
      0,
      KEYWORD_LIMIT,
    ),
    ratings: stored.ratings ?? fresh.ratings,
    externalIds: mergeExternalIds(fresh, stored),
  };
}

function mergeExternalIds(fresh: MediaTitle, stored: MediaTitle) {
  if (!fresh.externalIds && !stored.externalIds) {
    return undefined;
  }

  return {
    imdbId: fresh.externalIds?.imdbId ?? stored.externalIds?.imdbId ?? null,
    tvdbId: fresh.externalIds?.tvdbId ?? stored.externalIds?.tvdbId ?? null,
    wikidataId: fresh.externalIds?.wikidataId ?? stored.externalIds?.wikidataId ?? null,
    malId: stored.externalIds?.malId ?? fresh.externalIds?.malId ?? null,
    anilistId: stored.externalIds?.anilistId ?? fresh.externalIds?.anilistId ?? null,
  };
}

export async function storeCatalog(db: D1Database, catalogue: CatalogResponse) {
  const titles = [
    ...new Map(
      catalogue.sections.flatMap((section) => section.items).map((title) => [title.id, title]),
    ).values(),
  ];

  await storeItems(db, titles, catalogue.fetchedAt);

  return titles;
}

export async function storeItems(db: D1Database, items: MediaTitle[], sourceUpdatedAt: string) {
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
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(
      changed
        .slice(index, index + READ_CHUNK)
        .map((title) => upsertTitle(db, title, sourceUpdatedAt)),
    );
  }
}

function upsertTitle(db: D1Database, title: MediaTitle, sourceUpdatedAt: string) {
  return db
    .prepare(
      `INSERT INTO catalog_titles
         (id, media_type, tmdb_id, title, original_title, year, popularity,
          provider_ids, payload, source_updated_at, imdb_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(title),
      sourceUpdatedAt,
      title.imdbUrl ? (/\/(tt\d+)/u.exec(title.imdbUrl)?.[1] ?? null) : null,
    );
}
