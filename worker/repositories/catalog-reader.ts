import type { CatalogResponse, CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import {
  CATALOG_TITLE_COLUMNS,
  type CatalogTitleRow,
  parseSectionAudience,
  parseStoredTitleIds,
  withStoredPoster,
} from "../lib/catalog-payload.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { hydrateTitleRows } from "./catalog-arrays.ts";
import { searchTitlesFirst } from "./catalog-search.ts";

type SectionRow = {
  id: string;
  title: string;
  description: string;
  titleIds: string;
  sourceUpdatedAt: string;
  audience: string | null;
};

function reaches(audience: string | null, mine: ReadonlySet<string>) {
  const gate = parseSectionAudience(audience);

  if (!gate.providerIds?.length) {
    return true;
  }

  return gate.providerIds.some((id) => mine.has(id));
}

export function includesProvider(title: MediaTitle, providerIds: string[]) {
  return (
    providerIds.length === 0 ||
    title.providers.length === 0 ||
    title.providers.some((provider) => providerIds.includes(provider.id))
  );
}

const READ_CHUNK = 80;
const MIN_VISIBLE_ITEMS = 3;
const SECTION_ITEMS = 14;
const MAX_VISIBLE_SECTIONS = 18;

async function matchingTitleIds(db: D1Database, ids: string[], providerIds: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))];

  if (providerIds.length === 0 || uniqueIds.length === 0) {
    return new Set(uniqueIds);
  }

  const rows = await db
    .prepare(
      `SELECT id FROM catalog_titles
        WHERE id IN (SELECT value FROM json_each(?1))
          AND (
            NOT EXISTS (
              SELECT 1 FROM catalog_title_providers WHERE title_id = catalog_titles.id
            )
            OR EXISTS (
              SELECT 1 FROM catalog_title_providers
               WHERE title_id = catalog_titles.id
                 AND provider_id IN (SELECT value FROM json_each(?2))
            )
          )`,
    )
    .bind(JSON.stringify(uniqueIds), JSON.stringify(providerIds))
    .all<{ id: string }>();

  return new Set(rows.results.map((row) => row.id));
}

async function servedTitles(db: D1Database, rows: CatalogTitleRow[]): Promise<MediaTitle[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.map((title, index) => withStoredPoster(title, rows[index]?.poster_key));
}

export async function readRawItems(db: D1Database, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))];
  const rows: CatalogTitleRow[] = [];

  for (let index = 0; index < uniqueIds.length; index += READ_CHUNK) {
    const wave = uniqueIds.slice(index, index + READ_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const result = await db
      .prepare(
        `SELECT ${CATALOG_TITLE_COLUMNS} FROM catalog_titles WHERE id IN (${wave.map(() => "?").join(",")})`,
      )
      .bind(...wave)
      .all<CatalogTitleRow>();

    rows.push(...result.results);
  }

  const hydrated = await hydrateTitleRows(db, rows);

  return new Map(hydrated.map((title) => [title.id, title]));
}

export async function readItems(db: D1Database, ids: string[], limit = 30) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, Math.min(limit, 400));

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows: CatalogTitleRow[] = [];

  for (let index = 0; index < uniqueIds.length; index += READ_CHUNK) {
    const wave = uniqueIds.slice(index, index + READ_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const result = await db
      .prepare(
        `SELECT ${CATALOG_TITLE_COLUMNS}
         FROM catalog_titles WHERE id IN (${wave.map(() => "?").join(",")})`,
      )
      .bind(...wave)
      .all<CatalogTitleRow>();

    rows.push(...result.results);
  }

  const titlesById = new Map((await servedTitles(db, rows)).map((title) => [title.id, title]));

  return uniqueIds.flatMap((id) => {
    const title = titlesById.get(id);

    return title ? [title] : [];
  });
}

export async function readTitlesByMalId(db: D1Database, malIds: number[]) {
  const unique = [...new Set(malIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 40);
  const found = new Map<number, MediaTitle>();

  if (unique.length === 0) {
    return found;
  }

  const result = await db
    .prepare(
      `SELECT ${CATALOG_TITLE_COLUMNS}, mal_id AS malId
       FROM catalog_titles
       WHERE mal_id IN (${unique.map(() => "?").join(",")})`,
    )
    .bind(...unique)
    .all<CatalogTitleRow & { malId: number }>();

  const hydrated = await servedTitles(db, result.results);

  hydrated.forEach((title, index) => {
    const row = result.results[index];

    if (row) {
      found.set(row.malId, title);
    }
  });

  return found;
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
         source_updated_at AS sourceUpdatedAt,
         audience
       FROM catalog_sections
       ORDER BY rowid`,
    )
    .all<SectionRow>();

  if (rows.results.length === 0) {
    return null;
  }

  const mine = new Set(providerIds);
  const eligible = rows.results.filter((section) => reaches(section.audience, mine));
  const watchable = await matchingTitleIds(
    db,
    eligible.flatMap((section) => parseStoredTitleIds(section.titleIds)),
    providerIds,
  );

  const shortlist = eligible
    .map((section) => ({
      row: section,
      ids: parseStoredTitleIds(section.titleIds)
        .filter((id) => watchable.has(id))
        .slice(0, SECTION_ITEMS),
    }))
    .filter((section) => section.ids.length >= MIN_VISIBLE_ITEMS)
    .slice(0, MAX_VISIBLE_SECTIONS);

  const wanted = shortlist.flatMap((section) => section.ids);
  const titles = await readItems(db, wanted, wanted.length);
  const titlesById = new Map(titles.map((title) => [title.id, title]));
  const sections: CatalogSection[] = shortlist
    .map(({ row, ids }) => {
      const items = ids.flatMap((id) => {
        const title = titlesById.get(id);

        return title ? [title] : [];
      });

      if (items.length === 0) {
        logError("section_titles_unreadable", new Error(`${row.id} lost every stored title`), {
          area: "catalogue",
        });
      }

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        items,
      };
    })
    .filter((section) => section.items.length >= MIN_VISIBLE_ITEMS);
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

  if (!title) {
    return null;
  }

  const row = await db
    .prepare(`SELECT enriched_at AS enrichedAt FROM catalog_titles WHERE id = ?`)
    .bind(titleId)
    .first<{ enrichedAt: string | null }>();

  return { providers: title.providers, checked: Boolean(row?.enrichedAt) };
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

export async function readCollectionTitleIds(
  db: D1Database,
  collectionId: number,
  limit = 24,
  offset = 0,
) {
  const rows = await db
    .prepare(
      `SELECT id
       FROM catalog_titles
       WHERE collection_id = ?1
       ORDER BY COALESCE(release_date, '9999-12-31'), popularity DESC
       LIMIT ?2 OFFSET ?3`,
    )
    .bind(collectionId, clamp(limit, 1, 48), Math.max(0, offset))
    .all<{ id: string }>();

  return rows.results.map((row) => row.id);
}
