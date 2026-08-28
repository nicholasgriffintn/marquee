import { resolveSitelinks } from "../clients/wikidata-sitelinks.ts";
import { getPageviews, getProjectVolume } from "../clients/wikimedia.ts";
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
  readProjectVolumes,
  writeLanguageBuzz,
  writeProjectVolumes,
  type LanguageBuzzRow,
} from "../repositories/title-languages.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 40;
const REFRESH_DAYS = 7;
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

async function candidates(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT b.title_id AS titleId, t.wikidata_id AS entityId,
            t.original_language AS originalLanguage
     FROM title_buzz AS b
     JOIN catalog_titles AS t ON t.id = b.title_id
     WHERE b.article <> '' AND b.views >= ${MIN_TRENDING_VIEWS}
       AND t.wikidata_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM title_language_buzz AS l
         WHERE l.title_id = b.title_id AND l.measured_at > datetime('now', ?1)
       )
     ORDER BY b.views DESC
     LIMIT ?2`,
  )
    .bind(`-${REFRESH_DAYS} days`, SAMPLE_SIZE)
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

export async function syncWorldBoard(env: Bindings) {
  const pending = await candidates(env);

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
