import { getTvmazeSchedule, type ScheduledEpisode } from "../clients/tvmaze.ts";
import { hoursFrom, startOfHour, utcDay } from "../lib/dates.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";

const COUNTRIES: (string | null)[] = ["GB", "US", null];
const DAYS_AHEAD = 8;
const RETENTION_DAYS = 3;
const GRACE_HOURS = 6;
const NEXT_EPISODE_GRACE_HOURS = 3;

function upcomingDates() {
  const today = Date.now();

  return Array.from({ length: DAYS_AHEAD }, (_, index) =>
    utcDay(new Date(today + index * 86_400_000)),
  );
}

async function titleIdsByImdb(env: Bindings, imdbIds: string[]) {
  const unique = [...new Set(imdbIds.filter(Boolean))];

  if (unique.length === 0) {
    return new Map<string, string>();
  }

  const matched = new Map<string, string>();

  for (let index = 0; index < unique.length; index += 100) {
    const wave = unique.slice(index, index + 100);
    // oxlint-disable-next-line no-await-in-loop
    const rows = await env.DB.query<{ id: string; imdbId: string }>(
      `SELECT id, imdb_id AS "imdbId"
       FROM catalog_titles
       WHERE imdb_id IN (${wave.map((_, position) => `$${position + 1}`).join(", ")})`,
      [...wave],
    );

    for (const row of rows.rows) {
      matched.set(row.imdbId, row.id);
    }
  }

  return matched;
}

export async function syncSchedule(env: Bindings) {
  const dates = upcomingDates();
  const settled = await Promise.allSettled(
    COUNTRIES.flatMap((country) => dates.map((date) => getTvmazeSchedule(country, date))),
  );
  const episodes = new Map<string, ScheduledEpisode>();

  for (const result of settled) {
    if (result.status === "rejected") {
      logError("tvmaze_schedule_failed", result.reason);
      continue;
    }

    for (const episode of result.value) {
      episodes.set(episode.id, episode);
    }
  }

  if (episodes.size === 0) {
    return 0;
  }

  const entries = [...episodes.values()];
  const byImdb = await titleIdsByImdb(
    env,
    entries.flatMap((episode) => (episode.imdbId ? [episode.imdbId] : [])),
  );
  const known = entries.filter((episode) => episode.imdbId && byImdb.has(episode.imdbId));

  await env.DB.execute(
    `DELETE FROM title_schedule WHERE airs_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))`,
    [`-${RETENTION_DAYS} days`],
  );

  for (let index = 0; index < known.length; index += 50) {
    const wave = known.slice(index, index + 50);

    // oxlint-disable-next-line no-await-in-loop
    await env.DB.transaction(async (transaction) => {
      for (const episode of wave) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO title_schedule
             (id, title_id, imdb_id, show_name, season, episode, episode_name, airs_at, network)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT(id) DO UPDATE SET
             title_id = excluded.title_id,
             season = excluded.season,
             episode = excluded.episode,
             episode_name = excluded.episode_name,
             airs_at = excluded.airs_at,
             network = excluded.network,
             fetched_at = CURRENT_TIMESTAMP`,
          [
            episode.id,
            byImdb.get(episode.imdbId as string) ?? null,
            episode.imdbId,
            episode.showName,
            episode.season,
            episode.episode,
            episode.episodeName,
            episode.airsAt,
            episode.network,
          ],
        );
      }
    });
  }

  logEvent("schedule_synced", {
    fetched: entries.length,
    matched: known.length,
  });

  return known.length;
}

export type ScheduleRow = {
  titleId: string | null;
  showName: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  airsAt: string;
  network: string | null;
};

const VIEWER_QUERY = `SELECT s.title_id AS "titleId", s.show_name AS "showName", s.season, s.episode,
                s.episode_name AS "episodeName", s.airs_at AS "airsAt", s.network
         FROM title_schedule AS s
         JOIN viewing_entries AS v
           ON v.title_id = s.title_id AND v.viewer_id = $1 AND v.status IN ('watching', 'watchlist')
         WHERE s.airs_at BETWEEN (CURRENT_TIMESTAMP - INTERVAL '6 hour') AND (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL))
         ORDER BY s.airs_at
         LIMIT $3`;

const POPULAR_QUERY = `SELECT s.title_id AS "titleId", s.show_name AS "showName", s.season, s.episode,
                s.episode_name AS "episodeName", s.airs_at AS "airsAt", s.network
         FROM title_schedule AS s
         JOIN catalog_titles AS t ON t.id = s.title_id
         WHERE s.airs_at BETWEEN CAST($1 AS timestamptz) AND CAST($2 AS timestamptz)
         ORDER BY t.popularity DESC, s.airs_at
         LIMIT $3`;

export async function readTonight(
  env: Bindings,
  viewerId: string | null,
  limit: number,
  hours = 36,
) {
  const window = `+${hours} hours`;
  let rows = viewerId
    ? (await env.DB.query<ScheduleRow>(VIEWER_QUERY, [viewerId, window, limit])).rows
    : [];

  if (rows.length === 0) {
    const anchor = startOfHour();

    rows = (
      await env.DB.query<ScheduleRow>(POPULAR_QUERY, [
        hoursFrom(anchor, -GRACE_HOURS),
        hoursFrom(anchor, hours),
        limit,
      ])
    ).rows;
  }

  const titles = await readItems(
    env.DB,
    rows.flatMap((row) => (row.titleId ? [row.titleId] : [])),
    limit,
  );
  const byId = new Map(titles.map((title) => [title.id, title]));

  // oxlint-disable-next-line no-map-spread -- rows are capped by the caller's small `limit`, spread is clearest
  return rows.map((row) => ({
    ...row,
    item: row.titleId ? (byId.get(row.titleId) ?? null) : null,
  }));
}

export async function readNextEpisode(env: Bindings, titleId: string) {
  return env.DB.first<{
    season: number | null;
    episode: number | null;
    episodeName: string | null;
    airsAt: string;
    network: string | null;
  }>(
    `SELECT season, episode, episode_name AS "episodeName", airs_at AS "airsAt", network
     FROM title_schedule
     WHERE title_id = $1 AND airs_at >= CAST($2 AS timestamptz)
     ORDER BY airs_at
     LIMIT 1`,
    [titleId, hoursFrom(startOfHour(), -NEXT_EPISODE_GRACE_HOURS)],
  );
}
