import { resolveSitelinks } from "../clients/wikidata-sitelinks.ts";
import { articleUrl, getPageviews, getProjectVolume } from "../clients/wikimedia.ts";
import {
  BOARD_LANGUAGES,
  buzzScore,
  measureWorld,
  MIN_LANGUAGE_VIEWS,
  MIN_TRENDING_VIEWS,
  type LanguageReading,
} from "../lib/buzz.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { sum } from "../lib/numbers.ts";
import {
  readLanguageBuzz,
  readProjectVolumes,
  readWorldLeaders,
  writeLanguageBuzz,
  writeProjectVolumes,
  type LanguageBuzzRow,
} from "../repositories/title-languages.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 40;
const CONCURRENCY = 8;
const VOLUME_DAYS = 7;
const VOLUME_MAX_AGE_DAYS = 7;
const WINDOW_DAYS = 14;
const WEEK = 7;

type Candidate = {
  titleId: string;
  entityId: string;
  originalLanguage: string | null;
};

type Reading = LanguageReading & { titleId: string; article: string };

function languagesFor(candidate: Candidate) {
  const own = candidate.originalLanguage;

  return own && !BOARD_LANGUAGES.includes(own) ? [...BOARD_LANGUAGES, own] : BOARD_LANGUAGES;
}

async function candidates(env: Bindings, titleIds: string[]) {
  const rows = await env.DB.prepare(
    `SELECT b.title_id AS titleId, t.wikidata_id AS entityId,
            t.original_language AS originalLanguage
     FROM title_buzz AS b
     JOIN catalog_titles AS t ON t.id = b.title_id
     WHERE b.article <> '' AND b.views >= ${MIN_TRENDING_VIEWS}
       AND t.wikidata_id IS NOT NULL
       AND b.title_id IN (SELECT value FROM json_each(?))
     ORDER BY b.views DESC
     LIMIT ?`,
  )
    .bind(JSON.stringify(titleIds), SAMPLE_SIZE)
    .all<Candidate>();

  return rows.results;
}

async function projectVolumes(env: Bindings, languages: string[]) {
  const known = await readProjectVolumes(env.DB, languages, VOLUME_MAX_AGE_DAYS);
  const missing = languages.filter((language) => !known.has(language));
  const fetched = new Map<string, number>();

  for (let index = 0; index < missing.length; index += CONCURRENCY) {
    const wave = missing.slice(index, index + CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(
      wave.map(
        async (language) => [language, await getProjectVolume(language, VOLUME_DAYS)] as const,
      ),
    );

    for (const result of settled) {
      if (result.status === "rejected") {
        logError("project_volume_failed", result.reason);
      } else if (result.value[1] > 0) {
        fetched.set(result.value[0], result.value[1]);
      }
    }
  }

  await writeProjectVolumes(env.DB, fetched);

  return new Map([...known, ...fetched]);
}

async function read(task: { titleId: string; language: string; article: string }) {
  const daily = await getPageviews(task.article, WINDOW_DAYS, task.language);

  if (daily.length < WEEK + 1) {
    return null;
  }

  const views = sum(daily.slice(-WEEK));

  return views < MIN_LANGUAGE_VIEWS
    ? null
    : {
        titleId: task.titleId,
        language: task.language,
        article: task.article,
        views,
        previousViews: sum(daily.slice(-WINDOW_DAYS, -WEEK)),
      };
}

function tasks(pending: Candidate[], sitelinks: Map<string, Map<string, string>>) {
  return pending.flatMap((candidate) => {
    const found = sitelinks.get(candidate.entityId);

    return found
      ? languagesFor(candidate).flatMap((language) => {
          const article = found.get(language);

          return article ? [{ titleId: candidate.titleId, language, article }] : [];
        })
      : [];
  });
}

async function measureAll(pending: Candidate[], sitelinks: Map<string, Map<string, string>>) {
  const queued = tasks(pending, sitelinks);
  const readings: Reading[] = [];

  for (let index = 0; index < queued.length; index += CONCURRENCY) {
    // oxlint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(queued.slice(index, index + CONCURRENCY).map(read));

    for (const result of settled) {
      if (result.status === "rejected") {
        logError("language_pageviews_failed", result.reason);
      } else if (result.value) {
        readings.push(result.value);
      }
    }
  }

  return { readings, requested: queued.length };
}

function groupByTitle(readings: Reading[]) {
  const grouped = new Map<string, Reading[]>();

  for (const reading of readings) {
    grouped.set(reading.titleId, [...(grouped.get(reading.titleId) ?? []), reading]);
  }

  return grouped;
}

export async function syncWorldBoard(env: Bindings, titleIds: string[]) {
  const pending = await candidates(env, titleIds);

  if (pending.length === 0) {
    return 0;
  }

  const languages = [...new Set(pending.flatMap(languagesFor))];
  const volumes = await projectVolumes(env, languages);
  const sitelinks = await resolveSitelinks(
    pending.map((candidate) => candidate.entityId),
    languages,
  );
  const { readings, requested } = await measureAll(pending, sitelinks);
  const grouped = groupByTitle(readings);
  const rows: LanguageBuzzRow[] = [];
  const updates: D1PreparedStatement[] = [];

  for (const candidate of pending) {
    const measured = grouped.get(candidate.titleId) ?? [];
    const world = measureWorld(measured, volumes);

    for (const reading of measured) {
      rows.push({
        titleId: candidate.titleId,
        language: reading.language,
        article: reading.article,
        views: reading.views,
        previousViews: reading.previousViews,
        share: world.shares.get(reading.language) ?? 0,
      });
    }

    if (world.views > 0) {
      updates.push(
        env.DB.prepare(
          `UPDATE title_buzz
           SET world_views = ?, world_previous_views = ?, world_score = ?
           WHERE title_id = ?`,
        ).bind(
          world.views,
          world.previousViews,
          buzzScore(world.views, world.previousViews),
          candidate.titleId,
        ),
      );
    }
  }

  await writeLanguageBuzz(
    env.DB,
    pending.map((candidate) => candidate.titleId),
    rows,
  );

  if (updates.length > 0) {
    await env.DB.batch(updates);
  }

  logEvent("world_board_synced", {
    titles: pending.length,
    languages: languages.length,
    requested,
    measured: rows.length,
    scored: updates.length,
  });

  return rows.length;
}

export type WorldBoardEntry = {
  titleId: string;
  title: string;
  year: number | null;
  languages: WorldBoardLanguage[];
};

export type WorldBoardLanguage = {
  language: string;
  article: string;
  articleUrl: string;
  views: number;
  previousViews: number;
  share: number;
};

export async function getWorldBoard(db: D1Database, titleId: string) {
  const rows = await readLanguageBuzz(db, titleId);

  return {
    languages: rows.map((row) => ({
      language: row.language,
      article: row.article,
      articleUrl: articleUrl(row.article, row.language),
      views: row.views,
      previousViews: row.previousViews,
      share: row.share,
    })),
    measuredAt: rows[0]?.measuredAt ?? null,
    source: "Wikipedia pageviews, normalised per language edition",
  };
}

const LEADER_TITLES = 24;
const LEADER_LANGUAGES = 6;

export async function getWorldLeaders(db: D1Database) {
  const rows = await readWorldLeaders(db, LEADER_TITLES, LEADER_LANGUAGES);
  const boards = new Map<string, WorldBoardEntry>();

  for (const row of rows) {
    const board = boards.get(row.titleId) ?? {
      titleId: row.titleId,
      title: row.title,
      year: row.year,
      languages: [],
    };

    board.languages.push({
      language: row.language,
      article: row.article,
      articleUrl: articleUrl(row.article, row.language),
      views: row.views,
      previousViews: row.previousViews,
      share: row.share,
    });
    boards.set(row.titleId, board);
  }

  return [...boards.values()];
}
