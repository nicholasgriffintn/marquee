export async function claimGapLookup(db: D1Database, queryKey: string, cooldownHours: number) {
  const result = await db
    .prepare(
      `INSERT INTO catalogue_gap_lookups (query_key)
       VALUES (?)
       ON CONFLICT(query_key) DO UPDATE SET looked_up_at = CURRENT_TIMESTAMP
       WHERE catalogue_gap_lookups.looked_up_at <= datetime('now', ?)`,
    )
    .bind(queryKey, `-${Math.max(1, Math.trunc(cooldownHours))} hours`)
    .run();

  return result.meta.changes > 0;
}

export async function countRecentGapTitles(db: D1Database, windowHours: number) {
  const row = await db
    .prepare(
      `SELECT count(*) AS queued
       FROM catalogue_gap_titles
       WHERE queued_at > datetime('now', ?)`,
    )
    .bind(`-${Math.max(1, Math.trunc(windowHours))} hours`)
    .first<{ queued: number }>();

  return row?.queued ?? 0;
}

export async function claimGapTitles(db: D1Database, imdbIds: string[], cooldownDays: number) {
  if (imdbIds.length === 0) {
    return [];
  }

  const window = `-${Math.max(1, Math.trunc(cooldownDays))} days`;
  const results = await db.batch(
    imdbIds.map((imdbId) =>
      db
        .prepare(
          `INSERT INTO catalogue_gap_titles (imdb_id)
           VALUES (?)
           ON CONFLICT(imdb_id) DO UPDATE SET queued_at = CURRENT_TIMESTAMP
           WHERE catalogue_gap_titles.queued_at <= datetime('now', ?)`,
        )
        .bind(imdbId, window),
    ),
  );

  return imdbIds.filter((_, index) => (results[index]?.meta.changes ?? 0) > 0);
}

export async function readCatalogueImdbIds(db: D1Database, imdbIds: string[]) {
  if (imdbIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .prepare(
      `SELECT imdb_id AS imdbId
       FROM catalog_titles
       WHERE imdb_id IN (${imdbIds.map(() => "?").join(", ")})`,
    )
    .bind(...imdbIds)
    .all<{ imdbId: string }>();

  return new Set(rows.results.map((row) => row.imdbId));
}

export async function pruneCatalogueGaps(db: D1Database, retentionDays: number) {
  const window = `-${Math.max(1, Math.trunc(retentionDays))} days`;
  const [lookups, titles] = await db.batch([
    db
      .prepare(`DELETE FROM catalogue_gap_lookups WHERE looked_up_at < datetime('now', ?)`)
      .bind(window),
    db
      .prepare(`DELETE FROM catalogue_gap_titles WHERE queued_at < datetime('now', ?)`)
      .bind(window),
  ]);

  return (lookups?.meta.changes ?? 0) + (titles?.meta.changes ?? 0);
}
