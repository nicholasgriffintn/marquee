import type { CatalogResponse, MediaTitle } from "../../src/domain/catalog.ts";

export async function storeCatalog(db: D1Database, catalogue: CatalogResponse) {
  const titles = [
    ...new Map(
      catalogue.sections.flatMap((section) => section.items).map((title) => [title.id, title]),
    ).values(),
  ];
  const titleStatements = titles.map((title) => upsertTitle(db, title, catalogue.fetchedAt));
  const sectionStatements = catalogue.sections.map((section) =>
    db
      .prepare(
        `INSERT INTO catalog_sections
           (id, title, description, title_ids, source_updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        section.id,
        section.title,
        section.description,
        JSON.stringify(section.items.map((title) => title.id)),
        catalogue.fetchedAt,
      ),
  );

  await db.batch([
    ...titleStatements,
    db.prepare(`DELETE FROM catalog_sections`),
    ...sectionStatements,
  ]);

  return titles;
}

export async function storeItems(db: D1Database, items: MediaTitle[], sourceUpdatedAt: string) {
  if (items.length === 0) {
    return;
  }

  await db.batch(items.map((title) => upsertTitle(db, title, sourceUpdatedAt)));
}

function upsertTitle(db: D1Database, title: MediaTitle, sourceUpdatedAt: string) {
  return db
    .prepare(
      `INSERT INTO catalog_titles
         (id, media_type, tmdb_id, title, original_title, year, popularity,
          provider_ids, payload, source_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    );
}
