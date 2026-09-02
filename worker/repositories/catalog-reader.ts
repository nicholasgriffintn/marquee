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
import { READ_CHUNK } from "./catalog-array-utils.ts";
import { hydrateTitleRows, summariseTitleRows } from "./catalog-arrays.ts";
import { availabilityCondition, searchTitlesFirstRows } from "./catalog-search.ts";

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

const MIN_VISIBLE_ITEMS = 3;
const SECTION_ITEMS = 14;
const MAX_VISIBLE_SECTIONS = 18;

async function matchingTitleIds(db: Database, ids: string[], providerIds: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))];

  if (providerIds.length === 0 || uniqueIds.length === 0) {
    return new Set(uniqueIds);
  }

  const rows = await db.query<{ id: string }>(
    `SELECT id FROM catalog_titles
        WHERE id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))
          AND ${availabilityCondition("catalog_titles", "$2", "confirmed-or-unknown")}`,
    [JSON.stringify(uniqueIds), JSON.stringify(providerIds)],
  );

  return new Set(rows.rows.map((row) => row.id));
}

async function servedTitles(db: Database, rows: CatalogTitleRow[]): Promise<MediaTitle[]> {
  const hydrated = await hydrateTitleRows(db, rows);

  return hydrated.map((title, index) => withStoredPoster(title, rows[index]?.poster_key));
}

export async function readRawItems(db: Database, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))];
  const rows: CatalogTitleRow[] = [];

  for (let index = 0; index < uniqueIds.length; index += READ_CHUNK) {
    const wave = uniqueIds.slice(index, index + READ_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const result = await db.query<CatalogTitleRow>(
      `SELECT ${CATALOG_TITLE_COLUMNS} FROM catalog_titles WHERE id IN (${wave.map((_, position) => `$${position + 1}`).join(",")})`,
      [...wave],
    );

    rows.push(...result.rows);
  }

  const hydrated = await hydrateTitleRows(db, rows);

  return new Map(hydrated.map((title) => [title.id, title]));
}

export async function readItems(db: Database, ids: string[], limit = 30) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, Math.min(limit, 400));

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows: CatalogTitleRow[] = [];

  for (let index = 0; index < uniqueIds.length; index += READ_CHUNK) {
    const wave = uniqueIds.slice(index, index + READ_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const result = await db.query<CatalogTitleRow>(
      `SELECT ${CATALOG_TITLE_COLUMNS}
         FROM catalog_titles WHERE id IN (${wave.map((_, position) => `$${position + 1}`).join(",")})`,
      [...wave],
    );

    rows.push(...result.rows);
  }

  const titlesById = new Map((await servedTitles(db, rows)).map((title) => [title.id, title]));

  return uniqueIds.flatMap((id) => {
    const title = titlesById.get(id);

    return title ? [title] : [];
  });
}

export async function readSummaryItems(db: Database, ids: string[], limit = 30) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))].slice(0, Math.min(limit, 400));

  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await db.query<CatalogTitleRow>(
    `SELECT ${CATALOG_TITLE_COLUMNS}
       FROM catalog_titles WHERE id IN (${uniqueIds.map((_, position) => `$${position + 1}`).join(",")})`,
    [...uniqueIds],
  );
  const byId = new Map(
    (await summariseTitleRows(db, result.rows)).map((title) => [title.id, title] as const),
  );

  return uniqueIds.flatMap((id) => byId.get(id) ?? []);
}

export async function readTitlesByMalId(db: Database, malIds: number[]) {
  const unique = [...new Set(malIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 40);
  const found = new Map<number, MediaTitle>();

  if (unique.length === 0) {
    return found;
  }

  const result = await db.query<CatalogTitleRow & { malId: number }>(
    `SELECT ${CATALOG_TITLE_COLUMNS}, mal_id AS "malId"
       FROM catalog_titles
       WHERE mal_id IN (${unique.map((_, index) => `$${index + 1}`).join(",")})`,
    [...unique],
  );

  const hydrated = await summariseTitleRows(db, result.rows);

  hydrated.forEach((title, index) => {
    const row = result.rows[index];

    if (row) {
      found.set(row.malId, title);
    }
  });

  return found;
}

type SectionShortlist = {
  rows: SectionRow[];
  sections: { row: SectionRow; ids: string[] }[];
};

async function sectionShortlist(
  db: Database,
  providerIds: string[],
): Promise<SectionShortlist | null> {
  const rows = await db.query<SectionRow>(`SELECT
         id,
         title,
         description,
         title_ids AS "titleIds",
         source_updated_at AS "sourceUpdatedAt",
         audience
       FROM catalog_sections
       ORDER BY position, id`);

  if (rows.rows.length === 0) {
    return null;
  }

  const mine = new Set(providerIds);
  const eligible = rows.rows.filter((section) => reaches(section.audience, mine));
  const watchable = await matchingTitleIds(
    db,
    eligible.flatMap((section) => parseStoredTitleIds(section.titleIds)),
    providerIds,
  );

  return {
    rows: rows.rows,
    sections: eligible
      .map((section) => ({
        row: section,
        ids: parseStoredTitleIds(section.titleIds)
          .filter((id) => watchable.has(id))
          .slice(0, SECTION_ITEMS),
      }))
      .filter((section) => section.ids.length >= MIN_VISIBLE_ITEMS)
      .slice(0, MAX_VISIBLE_SECTIONS),
  };
}

async function readShortlistedTitles(db: Database, shortlist: { ids: string[] }[]) {
  const wanted = shortlist.flatMap((section) => section.ids);
  const titles = await readItems(db, wanted, wanted.length);

  return new Map(titles.map((title) => [title.id, title]));
}

async function readShortlistedSummaries(db: Database, shortlist: { ids: string[] }[]) {
  const wanted = shortlist.flatMap((section) => section.ids);
  const titles = await readSummaryItems(db, wanted, wanted.length);

  return new Map(titles.map((title) => [title.id, title]));
}

function sectionItems(ids: string[], titlesById: Map<string, MediaTitle>) {
  return ids.flatMap((id) => {
    const title = titlesById.get(id);

    return title ? [title] : [];
  });
}

export async function readSectionFronts(
  db: Database,
  providerIds: string[],
  perSection: number,
): Promise<CatalogSection[]> {
  const shortlist = await sectionShortlist(db, providerIds);

  if (!shortlist) {
    return [];
  }

  const fronts = shortlist.sections.map(({ row, ids }) => ({
    row,
    ids: ids.slice(0, perSection),
  }));
  const titlesById = await readShortlistedSummaries(db, fronts);

  return fronts.map(({ row, ids }) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    items: sectionItems(ids, titlesById),
  }));
}

export async function readCatalog(db: Database, query: string, providerIds: string[]) {
  if (query) {
    return readSearchResults(db, query, providerIds);
  }

  const shortlist = await sectionShortlist(db, providerIds);

  if (!shortlist) {
    return null;
  }

  const titlesById = await readShortlistedTitles(db, shortlist.sections);
  const sections: CatalogSection[] = shortlist.sections
    .map(({ row, ids }) => {
      const items = sectionItems(ids, titlesById);

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
  const fetchedAt = shortlist.rows.reduce(
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

export async function readAvailability(db: Database, titleId: string) {
  const [title] = await readItems(db, [titleId]);

  if (!title) {
    return null;
  }

  const row = await db.first<{ enrichedAt: string | null }>(
    `SELECT enriched_at AS "enrichedAt" FROM catalog_titles WHERE id = $1`,
    [titleId],
  );

  return { providers: title.providers, checked: Boolean(row?.enrichedAt) };
}

async function readSearchResults(db: Database, query: string, providerIds: string[]) {
  const rows = await searchTitlesFirstRows(db, {
    query,
    providerIds,
    availability: "confirmed-or-unknown",
    limit: 30,
  });
  const items = await summariseTitleRows(db, rows);

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

export type CollectionRecord = { id: number; name: string; titles: number };

export async function listCollections(
  db: Database,
  query: string,
  limit = 60,
  offset = 0,
): Promise<CollectionRecord[]> {
  const term = query.trim().toLowerCase();
  const size = clamp(limit, 1, 120);
  const skip = Math.max(0, offset);
  const rows = term
    ? await db.query<CollectionRecord>(
        `SELECT collection_id AS id, max(collection_name) AS name, count(*) AS titles
             FROM catalog_titles
            WHERE collection_id IS NOT NULL AND lower(collection_name) LIKE $1
            GROUP BY collection_id
            ORDER BY titles DESC, name
            LIMIT $2 OFFSET $3`,
        [`%${term}%`, size, skip],
      )
    : await db.query<CollectionRecord>(
        `SELECT collection_id AS id, max(collection_name) AS name, count(*) AS titles
             FROM catalog_titles
            WHERE collection_id IS NOT NULL
            GROUP BY collection_id
            ORDER BY titles DESC, name
            LIMIT $1 OFFSET $2`,
        [size, skip],
      );

  return rows.rows.filter((row) => Boolean(row.name));
}

export async function readCollectionTitleIds(
  db: Database,
  collectionId: number,
  limit = 24,
  offset = 0,
) {
  const rows = await db.query<{ id: string }>(
    `SELECT id
       FROM catalog_titles
       WHERE collection_id = $1
       ORDER BY COALESCE(release_date, '9999-12-31'), popularity DESC
       LIMIT $2 OFFSET $3`,
    [collectionId, clamp(limit, 1, 48), Math.max(0, offset)],
  );

  return rows.rows.map((row) => row.id);
}
