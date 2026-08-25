import type { CatalogResponse, CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import {
  parseSectionAudience,
  parseStoredTitle,
  parseStoredTitleIds,
} from "../lib/catalog-payload.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
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
            json_array_length(provider_ids) = 0
            OR EXISTS (
              SELECT 1 FROM json_each(provider_ids)
               WHERE json_each.value IN (SELECT value FROM json_each(?2))
            )
          )`,
    )
    .bind(JSON.stringify(uniqueIds), JSON.stringify(providerIds))
    .all<{ id: string }>();

  return new Set(rows.results.map((row) => row.id));
}

export async function readRawItems(db: D1Database, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(isKnownTitle))];
  const titles = new Map<string, MediaTitle>();

  for (let index = 0; index < uniqueIds.length; index += READ_CHUNK) {
    const wave = uniqueIds.slice(index, index + READ_CHUNK);
    // oxlint-disable-next-line no-await-in-loop
    const rows = await db
      .prepare(`SELECT payload FROM catalog_titles WHERE id IN (${wave.map(() => "?").join(",")})`)
      .bind(...wave)
      .all<PayloadRow>();

    for (const row of rows.results) {
      const title = parseStoredTitle(row.payload);

      if (title) {
        titles.set(title.id, title);
      }
    }
  }

  return titles;
}

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

export async function readTitlesByMalId(db: D1Database, malIds: number[]) {
  const unique = [...new Set(malIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 40);
  const found = new Map<number, MediaTitle>();

  if (unique.length === 0) {
    return found;
  }

  const rows = await db
    .prepare(
      `SELECT payload, poster_key AS posterKey,
              json_extract(payload, '$.externalIds.malId') AS malId
       FROM catalog_titles
       WHERE json_extract(payload, '$.externalIds.malId') IN (${unique.map(() => "?").join(",")})`,
    )
    .bind(...unique)
    .all<PayloadRow & { malId: number }>();

  for (const row of rows.results) {
    const title = parseStoredTitle(row.payload);

    if (title) {
      found.set(row.malId, withStoredPoster(title, row.posterKey));
    }
  }

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

      return { id: row.id, title: row.title, description: row.description, items };
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
       WHERE json_extract(payload, '$.collection.id') = ?1
       ORDER BY COALESCE(json_extract(payload, '$.releaseDate'), '9999-12-31'), popularity DESC
       LIMIT ?2 OFFSET ?3`,
    )
    .bind(collectionId, clamp(limit, 1, 48), Math.max(0, offset))
    .all<{ id: string }>();

  return rows.results.map((row) => row.id);
}
