const WRITE_BATCH = 50;

export type LanguageBuzzRow = {
  titleId: string;
  language: string;
  article: string;
  views: number;
  previousViews: number;
  share: number;
};

export type LanguageBuzzRead = Omit<LanguageBuzzRow, "titleId"> & {
  measuredAt: string;
};

export async function readProjectVolumes(
  db: Database,
  languages: string[],
  maxAgeDays: number,
) {
  const rows = await db.query<{ language: string; views: number }>(
    `SELECT language, views
       FROM wikipedia_project_volume
       WHERE measured_at > (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)) AND language IN (SELECT value FROM jsonb_array_elements_text(CAST($2 AS jsonb)) AS entries(value))`,
    [`-${maxAgeDays} days`, JSON.stringify(languages)],
  );

  return new Map(rows.rows.map((row) => [row.language, row.views]));
}

export async function writeProjectVolumes(
  db: Database,
  volumes: Map<string, number>,
) {
  if (volumes.size > 0) {
    await db.transaction(async (transaction) => {
      for (const [language, views] of volumes) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO wikipedia_project_volume (language, views, measured_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT(language) DO UPDATE SET
             views = excluded.views,
             measured_at = CURRENT_TIMESTAMP`,
          [language, views],
        );
      }
    });
  }
}

export async function writeLanguageBuzz(
  db: Database,
  titleIds: string[],
  rows: LanguageBuzzRow[],
) {
  for (let index = 0; index < rows.length; index += WRITE_BATCH) {
    const wave = rows.slice(index, index + WRITE_BATCH);

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      for (const row of wave) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO title_language_buzz
               (title_id, language, article, views, previous_views, share, measured_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT (title_id, language) DO UPDATE SET
               article = excluded.article,
               views = excluded.views,
               previous_views = excluded.previous_views,
               share = excluded.share,
               measured_at = excluded.measured_at`,
          [
            row.titleId,
            row.language,
            row.article,
            row.views,
            row.previousViews,
            row.share,
          ],
        );
      }
    });
  }

  const kept = new Map<string, string[]>();

  for (const row of rows) {
    kept.set(row.titleId, [...(kept.get(row.titleId) ?? []), row.language]);
  }

  for (const titleId of titleIds) {
    const languages = kept.get(titleId) ?? [];

    // oxlint-disable-next-line no-await-in-loop
    await db.execute(
      languages.length === 0
        ? `DELETE FROM title_language_buzz WHERE title_id = $1`
        : `DELETE FROM title_language_buzz
             WHERE title_id = $1
               AND language NOT IN (SELECT value FROM jsonb_array_elements_text(CAST($2 AS jsonb)) AS entries(value))`,
      languages.length === 0 ? [titleId] : [titleId, JSON.stringify(languages)],
    );
  }
}
