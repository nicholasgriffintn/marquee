const WRITE_BATCH = 50;

export type LanguageBuzzRow = {
  titleId: string;
  language: string;
  article: string;
  views: number;
  previousViews: number;
  share: number;
};

export type LanguageBuzzRead = Omit<LanguageBuzzRow, "titleId"> & { measuredAt: string };

export async function readProjectVolumes(db: D1Database, languages: string[], maxAgeDays: number) {
  const rows = await db
    .prepare(
      `SELECT language, views
       FROM wikipedia_project_volume
       WHERE measured_at > datetime('now', ?) AND language IN (SELECT value FROM json_each(?))`,
    )
    .bind(`-${maxAgeDays} days`, JSON.stringify(languages))
    .all<{ language: string; views: number }>();

  return new Map(rows.results.map((row) => [row.language, row.views]));
}

export async function writeProjectVolumes(db: D1Database, volumes: Map<string, number>) {
  const statements = [...volumes].map(([language, views]) =>
    db
      .prepare(
        `INSERT INTO wikipedia_project_volume (language, views, measured_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(language) DO UPDATE SET
           views = excluded.views,
           measured_at = CURRENT_TIMESTAMP`,
      )
      .bind(language, views),
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function writeLanguageBuzz(
  db: D1Database,
  titleIds: string[],
  rows: LanguageBuzzRow[],
) {
  await db
    .prepare(`DELETE FROM title_language_buzz WHERE title_id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(titleIds))
    .run();

  for (let index = 0; index < rows.length; index += WRITE_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(
      rows.slice(index, index + WRITE_BATCH).map((row) =>
        db
          .prepare(
            `INSERT INTO title_language_buzz
               (title_id, language, article, views, previous_views, share, measured_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(row.titleId, row.language, row.article, row.views, row.previousViews, row.share),
      ),
    );
  }
}

export async function readLanguageBuzz(db: D1Database, titleId: string) {
  const rows = await db
    .prepare(
      `SELECT language, article, views, previous_views AS previousViews, share,
              measured_at AS measuredAt
       FROM title_language_buzz
       WHERE title_id = ?
       ORDER BY share DESC`,
    )
    .bind(titleId)
    .all<LanguageBuzzRead>();

  return rows.results;
}

export type WorldLeaderRow = LanguageBuzzRead & {
  titleId: string;
  title: string;
  year: number | null;
};

export async function readWorldLeaders(db: D1Database, limit: number, perTitle: number) {
  const rows = await db
    .prepare(
      `WITH leaders AS (
         SELECT b.title_id
         FROM title_buzz AS b
         JOIN catalog_titles AS t ON t.id = b.title_id
         WHERE b.world_score > 0
           AND (SELECT count(*) FROM title_language_buzz AS l
                 WHERE l.title_id = b.title_id AND l.views > 0) >= 2
         ORDER BY b.world_score DESC
         LIMIT ?1
       )
       SELECT l.title_id AS titleId, t.title, t.year, l.language, l.article, l.views,
              l.previous_views AS previousViews, l.share, l.measured_at AS measuredAt
       FROM title_language_buzz AS l
       JOIN leaders ON leaders.title_id = l.title_id
       JOIN catalog_titles AS t ON t.id = l.title_id
       WHERE l.views > 0
         AND (SELECT count(*) FROM title_language_buzz AS inner_l
               WHERE inner_l.title_id = l.title_id AND inner_l.views > 0
                 AND inner_l.share > l.share) < ?2
       ORDER BY l.title_id, l.share DESC`,
    )
    .bind(limit, perTitle)
    .all<WorldLeaderRow>();

  return rows.results;
}
