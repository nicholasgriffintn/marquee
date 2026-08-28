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
