import type { CatalogResponse, CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import { parseStoredTitle, parseStoredTitleIds } from "../lib/catalog-payload.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { searchTitlesFirst } from "./catalog-search.ts";

type PayloadRow = { payload: string; posterKey?: string | null };

function withStoredPoster(title: MediaTitle, posterKey?: string | null) {
  return posterKey ? { ...title, posterUrl: `/media/${posterKey}` } : title;
}

type SectionRow = {
  id: string;
  title: string;
  description: string;
  titleIds: string;
  sourceUpdatedAt: string;
};

function includesProvider(title: MediaTitle, providerIds: string[]) {
  return (
    providerIds.length === 0 ||
    title.providers.some((provider) => providerIds.includes(provider.id))
  );
}

const READ_CHUNK = 80;

export async function readItems(db: D1Database, ids: string[], limit = 30) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, Math.min(limit, 400));

  if (uniqueIds.length === 0) {
    return [];
  }

  const titlesById = new Map<string, MediaTitle>();

  for (let index = 0; index < uniqueIds.length; index += READ_CHUNK) {
    const wave = uniqueIds.slice(index, index + READ_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const rows = await db
      .prepare(
        `SELECT payload, poster_key AS posterKey FROM catalog_titles WHERE id IN (${wave
          .map(() => "?")
          .join(",")})`,
      )
      .bind(...wave)
      .all<PayloadRow>();

    for (const row of rows.results) {
      const title = parseStoredTitle(row.payload);

      if (title) {
        titlesById.set(title.id, withStoredPoster(title, row.posterKey));
      }
    }
  }

  return uniqueIds.flatMap((id) => {
    const title = titlesById.get(id);

    return title ? [title] : [];
  });
}

export async function readCatalog(db: D1Database, query: string, providerIds: string[]) {
  if (query) {
    return readSearchResults(db, query, providerIds);
  }

  const rows = await db
    .prepare(
      `SELECT
         id,
         title,
         description,
         title_ids AS titleIds,
         source_updated_at AS sourceUpdatedAt
       FROM catalog_sections
       ORDER BY rowid`,
    )
    .all<SectionRow>();

  if (rows.results.length === 0) {
    return null;
  }

  const titleIds = rows.results.flatMap((section) => parseStoredTitleIds(section.titleIds));
  const titles = await readItems(db, titleIds, titleIds.length);
  const titlesById = new Map(titles.map((title) => [title.id, title]));
  const sections: CatalogSection[] = rows.results.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    items: parseStoredTitleIds(section.titleIds)
      .flatMap((id) => {
        const title = titlesById.get(id);

        return title ? [title] : [];
      })
      .filter((title) => includesProvider(title, providerIds)),
  }));
  const fetchedAt = rows.results.reduce(
    (latest, section) => (section.sourceUpdatedAt > latest ? section.sourceUpdatedAt : latest),
    "",
  );

  return {
    sections,
    source: "TMDB",
    availabilitySource: "JustWatch via TMDB",
    fetchedAt,
  } satisfies CatalogResponse;
}

export async function readAvailability(db: D1Database, titleId: string) {
  const [title] = await readItems(db, [titleId]);

  return title?.providers ?? null;
}

async function readSearchResults(db: D1Database, query: string, providerIds: string[]) {
  const items = (await searchTitlesFirst(db, { query, limit: 30 })).filter((title) =>
    includesProvider(title, providerIds),
  );

  return {
    sections: [
      {
        id: "search",
        title: "Search results",
        description: `Results from the Marquee catalogue for “${query}”`,
        items,
      },
    ],
    source: "TMDB",
    availabilitySource: "JustWatch via TMDB",
    fetchedAt: new Date().toISOString(),
  } satisfies CatalogResponse;
}
