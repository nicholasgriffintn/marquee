import { eventsTable, queryAnalytics } from "../clients/analytics.ts";
import { logError } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";

const WINDOW_DAYS = 28;
const CLICK_WEIGHT = 1;
const EXIT_WEIGHT = 4;
const PRIOR_IMPRESSIONS = 20;
const PRIOR_SCORE = 0.15;

type Row = { source: string; name: string; total: number };

export type AngleScore = {
  angle: string;
  impressions: number;
  clicks: number;
  exits: number;
  score: number;
};

function scoreFor(impressions: number, clicks: number, exits: number) {
  const value = clicks * CLICK_WEIGHT + exits * EXIT_WEIGHT;
  const weight = impressions + PRIOR_IMPRESSIONS;

  return (value + PRIOR_IMPRESSIONS * PRIOR_SCORE) / weight;
}

export async function computeAngleScores(env: Bindings) {
  const rows = await queryAnalytics<Row>(
    env,
    `SELECT blob6 AS source, blob1 AS name, sum(_sample_interval) AS total
       FROM ${eventsTable()}
      WHERE timestamp > NOW() - INTERVAL '${WINDOW_DAYS}' DAY
        AND blob1 IN ('rail_impression', 'rail_click', 'provider_exit')
        AND blob6 != ''
      GROUP BY source, name
      FORMAT JSON`,
  );

  if (rows.length === 0) {
    return [];
  }

  const totals = new Map<string, AngleScore>();

  for (const row of rows) {
    const current = totals.get(row.source) ?? {
      angle: row.source,
      impressions: 0,
      clicks: 0,
      exits: 0,
      score: 0,
    };
    const total = row.total || 0;

    if (row.name === "rail_impression") {
      current.impressions += total;
    } else if (row.name === "rail_click") {
      current.clicks += total;
    } else {
      current.exits += total;
    }

    totals.set(row.source, current);
  }

  const scores = [...totals.values()].map((entry) => ({
    ...entry,
    score: scoreFor(entry.impressions, entry.clicks, entry.exits),
  }));

  try {
    await env.DB.batch(
      scores.map((entry) =>
        env.DB.prepare(
          `INSERT INTO angle_scores (angle, impressions, clicks, exits, score, computed_at)
           VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
           ON CONFLICT (angle) DO UPDATE SET
             impressions = excluded.impressions,
             clicks = excluded.clicks,
             exits = excluded.exits,
             score = excluded.score,
             computed_at = CURRENT_TIMESTAMP`,
        ).bind(entry.angle, entry.impressions, entry.clicks, entry.exits, entry.score),
      ),
    );
  } catch (error) {
    logError("angle_scores_write_failed", error);
  }

  console.log(JSON.stringify({ event: "angle_scores", angles: scores.length }));

  return scores;
}

export async function readAngleScores(db: D1Database) {
  try {
    const rows = await db
      .prepare(
        `SELECT angle, score FROM angle_scores
          WHERE julianday(computed_at) > julianday('now', '-45 days')`,
      )
      .all<{ angle: string; score: number }>();

    return new Map(rows.results.map((row) => [row.angle, row.score]));
  } catch {
    return new Map<string, number>();
  }
}
