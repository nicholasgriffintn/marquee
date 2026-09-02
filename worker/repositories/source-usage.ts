export type SourceUsageRow = {
  source: string;
  calls: number;
  failures: number;
  durationMs: number;
  lastStatus: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

const RETENTION_DAYS = 90;

export async function readSourceUsage(db: Database) {
  const result = await db.query<SourceUsageRow>(
    `SELECT source, calls, failures, duration_ms AS "durationMs",
            last_status AS "lastStatus", last_success_at AS "lastSuccessAt",
            last_error_at AS "lastErrorAt", last_error AS "lastError"
       FROM source_usage
      WHERE day = CURRENT_DATE
      ORDER BY source`,
  );

  return result.rows;
}

export async function readSourceUsageTrend(db: Database, source: string, days: number) {
  const result = await db.query<{ day: string; calls: number; failures: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, calls, failures
       FROM source_usage
      WHERE source = $1 AND day > (CURRENT_DATE - CAST($2 AS INTEGER))
      ORDER BY day DESC`,
    [source, Math.max(1, Math.trunc(days))],
  );

  return result.rows;
}

export async function pruneSourceUsage(db: Database) {
  const result = await db.execute(
    `DELETE FROM source_usage WHERE day < (CURRENT_DATE - CAST($1 AS INTEGER))`,
    [RETENTION_DAYS],
  );

  return result.rowCount;
}
