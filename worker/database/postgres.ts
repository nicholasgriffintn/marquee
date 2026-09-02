import { Pool, types } from "pg";

import type { Database, DatabaseResult, DatabaseTransaction, DatabaseValue } from "./types.ts";

const POSTGRES_BIGINT = 20;
const POSTGRES_DATE = 1082;
const POSTGRES_TIMESTAMP = 1114;
const POSTGRES_TIMESTAMPTZ = 1184;
const POOL_SIZE = 16;
const CONNECTION_TIMEOUT_MS = 2_000;

types.setTypeParser(POSTGRES_BIGINT, (value) => Number(value));
types.setTypeParser(POSTGRES_DATE, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMP, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMPTZ, (value) => value);

type Queryable = {
  query(
    sql: string,
    values: DatabaseValue[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
};

class PostgresQueries implements DatabaseTransaction {
  readonly #queryable: Queryable;

  constructor(queryable: Queryable) {
    this.#queryable = queryable;
  }

  async query<T extends object = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    const result = await this.#queryable.query(sql, values);

    return toResult<T>(result.rows as T[], result.rowCount);
  }

  async first<T extends object = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    const result = await this.query<T>(sql, values);

    return result.rows[0] ?? null;
  }

  execute<T extends object = Record<string, unknown>>(sql: string, values: DatabaseValue[] = []) {
    return this.query<T>(sql, values);
  }
}

export class PostgresDatabase extends PostgresQueries implements Database {
  readonly #pool: Pool;

  private constructor(pool: Pool) {
    super(pool);
    this.#pool = pool;
  }

  static connect(connectionString: string, statementTimeoutMs: number) {
    const pool = new Pool({
      connectionString,
      max: POOL_SIZE,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      statement_timeout: statementTimeoutMs,
      query_timeout: statementTimeoutMs,
    });

    pool.on("error", (error) => {
      console.error(JSON.stringify({ event: "postgres_idle_client_error", detail: error.message }));
    });

    return Promise.resolve(new PostgresDatabase(pool));
  }

  async transaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>) {
    const client = await this.#pool.connect();

    try {
      await client.query("BEGIN");

      const result = await operation(new PostgresQueries(client));

      await client.query("COMMIT");

      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  close() {
    return this.#pool.end();
  }
}

function toResult<T extends object>(rows: T[], rowCount: number | null): DatabaseResult<T> {
  return { rows, rowCount: rowCount ?? 0 };
}
