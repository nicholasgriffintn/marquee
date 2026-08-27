import { getTvmazeSchedule, type ScheduledEpisode } from "../clients/tvmaze.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";

const COUNTRIES: (string | null)[] = ["GB", "US", null];
const DAYS_AHEAD = 8;
const RETENTION_DAYS = 3;

function upcomingDates() {
  const today = Date.now();

  return Array.from({ length: DAYS_AHEAD }, (_, index) =>
    new Date(today + index * 86_400_000).toISOString().slice(0, 10),
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
    const rows = await env.DB.prepare(
      `SELECT id, imdb_id AS imdbId
       FROM catalog_titles
       WHERE imdb_id IN (${wave.map(() => "?").join(", ")})`,
    )
      .bind(...wave)
      .all<{ id: string; imdbId: string }>();

    for (const row of rows.results) {
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

  await env.DB.prepare(`DELETE FROM title_schedule WHERE airs_at < datetime('now', ?)`)
    .bind(`-${RETENTION_DAYS} days`)
    .run();

  for (let index = 0; index < known.length; index += 50) {
    const wave = known.slice(index, index + 50);

    // oxlint-disable-next-line no-await-in-loop
    await env.DB.batch(
      wave.map((episode) =>
        env.DB.prepare(
          `INSERT INTO title_schedule
             (id, title_id, imdb_id, show_name, season, episode, episode_name, airs_at, network)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title_id = excluded.title_id,
             season = excluded.season,
             episode = excluded.episode,
             episode_name = excluded.episode_name,
             airs_at = excluded.airs_at,
             network = excluded.network,
             fetched_at = CURRENT_TIMESTAMP`,
        ).bind(
          episode.id,
          byImdb.get(episode.imdbId as string) ?? null,
          episode.imdbId,
          episode.showName,
          episode.season,
          episode.episode,
          episode.episodeName,
          episode.airsAt,
          episode.network,
        ),
      ),
    );
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

const VIEWER_QUERY = `SELECT s.title_id AS titleId, s.show_name AS showName, s.season, s.episode,
                s.episode_name AS episodeName, s.airs_at AS airsAt, s.network
         FROM title_schedule AS s
         JOIN viewing_entries AS v
           ON v.title_id = s.title_id AND v.viewer_id = ? AND v.status IN ('watching', 'watchlist')
         WHERE s.airs_at BETWEEN datetime('now', '-6 hours') AND datetime('now', ?)
         ORDER BY s.airs_at
         LIMIT ?`;

const POPULAR_QUERY = `SELECT s.title_id AS titleId, s.show_name AS showName, s.season, s.episode,
                s.episode_name AS episodeName, s.airs_at AS airsAt, s.network
         FROM title_schedule AS s
         JOIN catalog_titles AS t ON t.id = s.title_id
         WHERE s.airs_at BETWEEN datetime('now', '-6 hours') AND datetime('now', ?)
         ORDER BY t.popularity DESC, s.airs_at
         LIMIT ?`;

export async function readTonight(
  env: Bindings,
  viewerId: string | null,
  limit: number,
  hours = 36,
) {
  const window = `+${hours} hours`;
  let rows = viewerId
    ? (await env.DB.prepare(VIEWER_QUERY).bind(viewerId, window, limit).all<ScheduleRow>()).results
    : [];

  if (rows.length === 0) {
    rows = (await env.DB.prepare(POPULAR_QUERY).bind(window, limit).all<ScheduleRow>()).results;
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
  return env.DB.prepare(
    `SELECT season, episode, episode_name AS episodeName, airs_at AS airsAt, network
     FROM title_schedule
     WHERE title_id = ? AND airs_at >= datetime('now', '-3 hours')
     ORDER BY airs_at
     LIMIT 1`,
  )
    .bind(titleId)
    .first<{
      season: number | null;
      episode: number | null;
      episodeName: string | null;
      airsAt: string;
      network: string | null;
    }>();
}
