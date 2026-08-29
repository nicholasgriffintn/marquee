export async function claimGapLookup(db: Database, queryKey: string, cooldownHours: number) {
  const result = await db.execute(
    `INSERT INTO catalogue_gap_lookups (query_key)
       VALUES ($1)
       ON CONFLICT(query_key) DO UPDATE SET looked_up_at = CURRENT_TIMESTAMP
       WHERE catalogue_gap_lookups.looked_up_at <= (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))`,
    [queryKey, `-${Math.max(1, Math.trunc(cooldownHours))} hours`],
  );

  return result.rowCount > 0;
}

export async function countRecentGapTitles(db: Database, windowHours: number) {
  const row = await db.first<{ queued: number }>(
    `SELECT count(*) AS queued
       FROM catalogue_gap_titles
       WHERE queued_at > (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))`,
    [`-${Math.max(1, Math.trunc(windowHours))} hours`],
  );

  return row?.queued ?? 0;
}

export async function claimGapTitles(db: Database, imdbIds: string[], cooldownDays: number) {
  if (imdbIds.length === 0) {
    return [];
  }

  const window = `-${Math.max(1, Math.trunc(cooldownDays))} days`;
  const results = await db.transaction(async (transaction) => {
    const claims = [];

    for (const imdbId of imdbIds) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await transaction.execute(
        `INSERT INTO catalogue_gap_titles (imdb_id)
           VALUES ($1)
           ON CONFLICT(imdb_id) DO UPDATE SET queued_at = CURRENT_TIMESTAMP
           WHERE catalogue_gap_titles.queued_at <= (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))`,
        [imdbId, window],
      );

      claims.push(result);
    }

    return claims;
  });

  return imdbIds.filter((_, index) => (results[index]?.rowCount ?? 0) > 0);
}

export async function readCatalogueImdbIds(db: Database, imdbIds: string[]) {
  if (imdbIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db.query<{ imdbId: string }>(
    `SELECT imdb_id AS "imdbId"
       FROM catalog_titles
       WHERE imdb_id IN (${imdbIds.map((_, index) => `$${index + 1}`).join(", ")})`,
    [...imdbIds],
  );

  return new Set(rows.rows.map((row) => row.imdbId));
}

export async function pruneCatalogueGaps(db: Database, retentionDays: number) {
  const window = `-${Math.max(1, Math.trunc(retentionDays))} days`;
  const [lookups, titles] = await db.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(
        `DELETE FROM catalogue_gap_lookups WHERE looked_up_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))`,
        [window],
      ),
    );
    results.push(
      await transaction.execute(
        `DELETE FROM catalogue_gap_titles WHERE queued_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))`,
        [window],
      ),
    );

    return results;
  });

  return (lookups?.rowCount ?? 0) + (titles?.rowCount ?? 0);
}
