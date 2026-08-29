import { eventsTable, queryAnalytics } from "../clients/analytics.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import type { Bindings } from "../types.ts";

const WINDOW_DAYS = 28;
const CLICK_WEIGHT = 1;
const EXIT_WEIGHT = 3;
const WATCHED_WEIGHT = 8;
const PRIOR_IMPRESSIONS = 20;
const PRIOR_SCORE = 0.15;

type Row = { source: string; name: string; total: number; dwell: number };

export type AngleScore = {
  angle: string;
  impressions: number;
  clicks: number;
  views: number;
  exits: number;
  watched: number;
  attrition: number;
  dwellMs: number;
  score: number;
};

function scoreFor(entry: AngleScore) {
  const value =
    entry.clicks * CLICK_WEIGHT + entry.exits * EXIT_WEIGHT + entry.watched * WATCHED_WEIGHT;
  const weight = entry.impressions + PRIOR_IMPRESSIONS;

  return (value + PRIOR_IMPRESSIONS * PRIOR_SCORE) / weight;
}

function attritionFor(entry: AngleScore) {
  return entry.clicks > 0 ? clamp(1 - (entry.exits + entry.watched) / entry.clicks, 0, 1) : 0;
}

function blank(angle: string): AngleScore {
  return {
    angle,
    impressions: 0,
    clicks: 0,
    views: 0,
    exits: 0,
    watched: 0,
    attrition: 0,
    dwellMs: 0,
    score: 0,
  };
}

function accumulate(entry: AngleScore, row: Row) {
  const total = row.total || 0;

  if (row.name === "rail_impression") {
    entry.impressions += total;
  } else if (row.name === "rail_click") {
    entry.clicks += total;
    entry.dwellMs = Math.max(0, Math.round(row.dwell || 0));
  } else if (row.name === "title_view") {
    entry.views += total;
  } else if (row.name === "title_watched") {
    entry.watched += total;
  } else {
    entry.exits += total;
  }
}

export async function computeAngleScores(env: Bindings) {
  const rows = await queryAnalytics<Row>(
    env,
    `SELECT blob6 AS source,
            blob1 AS name,
            sum(_sample_interval) AS total,
            sum(double3 * _sample_interval) / sum(_sample_interval) AS dwell
       FROM ${eventsTable()}
      WHERE timestamp > NOW() - INTERVAL '${WINDOW_DAYS}' DAY
        AND blob1 IN ('rail_impression', 'rail_click', 'title_view', 'provider_exit', 'title_watched')
        AND blob6 != ''
      GROUP BY source, name
      FORMAT JSON`,
  );

  if (rows.length === 0) {
    return [];
  }

  const totals = new Map<string, AngleScore>();

  for (const row of rows) {
    const entry = totals.get(row.source) ?? blank(row.source);

    accumulate(entry, row);
    totals.set(row.source, entry);
  }

  const scores = [...totals.values()];

  for (const entry of scores) {
    entry.attrition = attritionFor(entry);
    entry.score = scoreFor(entry);
  }

  try {
    await env.DB.transaction(async (transaction) => {
      for (const entry of scores) {
        await transaction.execute(
          `INSERT INTO angle_scores (angle, impressions, clicks, views, exits, watched, attrition, dwell_ms, score, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
           ON CONFLICT (angle) DO UPDATE SET
             impressions = excluded.impressions,
             clicks = excluded.clicks,
             views = excluded.views,
             exits = excluded.exits,
             watched = excluded.watched,
             attrition = excluded.attrition,
             dwell_ms = excluded.dwell_ms,
             score = excluded.score,
             computed_at = CURRENT_TIMESTAMP`,
          [
            entry.angle,
            entry.impressions,
            entry.clicks,
            entry.views,
            entry.exits,
            entry.watched,
            entry.attrition,
            entry.dwellMs,
            entry.score,
          ],
        );
      }
    });
  } catch (error) {
    logError("angle_scores_write_failed", error);
  }

  logEvent("angle_scores", { angles: scores.length });

  return scores;
}

export async function readAngleScores(db: Database) {
  try {
    const rows = await db.query<{
      angle: string;
      score: number;
    }>(`SELECT angle, score FROM angle_scores
          WHERE computed_at > (CURRENT_TIMESTAMP - INTERVAL '45 day')`);

    return new Map(rows.rows.map((row) => [row.angle, row.score]));
  } catch {
    return new Map<string, number>();
  }
}

export async function readAngleBoard(db: Database, limit = 40): Promise<AngleScore[]> {
  try {
    const rows =
      await db.query<AngleScore>(`SELECT angle, impressions, clicks, views, exits, watched, attrition, dwell_ms AS "dwellMs", score
           FROM angle_scores
          WHERE computed_at > (CURRENT_TIMESTAMP - INTERVAL '45 day')
          ORDER BY impressions DESC
          LIMIT ${clamp(limit, 1, 200)}`);

    return rows.rows;
  } catch (error) {
    logError("angle_board_read_failed", error);

    return [];
  }
}
