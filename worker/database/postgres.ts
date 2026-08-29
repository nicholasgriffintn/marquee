import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

import { compileQuery } from "./query.ts";
import type {
  Database,
  DatabaseResult,
  DatabaseTransaction,
  DatabaseValue,
} from "./types.ts";

const POSTGRES_BIGINT = 20;
const POSTGRES_DATE = 1082;
const POSTGRES_TIMESTAMP = 1114;
const POSTGRES_TIMESTAMPTZ = 1184;

types.setTypeParser(POSTGRES_BIGINT, (value) => Number(value));
types.setTypeParser(POSTGRES_DATE, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMP, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMPTZ, (value) => value);

type Queryable = Pick<Pool, "query"> | PoolClient;

class PostgresTransaction implements DatabaseTransaction {
  readonly #queryable: Queryable;

  constructor(queryable: Queryable) {
    this.#queryable = queryable;
  }

  async query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    const compiled = compileQuery(sql);

    validateParameters(compiled.parameterCount, values.length);

    const result = await this.#queryable.query<T>(compiled.text, values);

    return toResult(result.rows, result.rowCount);
  }

  async first<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    const result = await this.query<T>(sql, values);

    return result.rows[0] ?? null;
  }

  execute<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    return this.query<T>(sql, values);
  }
}

export class PostgresDatabase extends PostgresTransaction implements Database {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    const pool = new Pool({ connectionString, max: 5 });

    super(pool);
    this.#pool = pool;
  }

  async transaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>) {
    const client = await this.#pool.connect();

    try {
      await client.query("BEGIN");

      const result = await operation(new PostgresTransaction(client));

      await client.query("COMMIT");

      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  close() {
    return this.#pool.end();
  }
}

function toResult<T extends Record<string, unknown>>(
  rows: T[],
  rowCount: number | null,
): DatabaseResult<T> {
  return {
    rows,
    rowCount: rowCount ?? 0,
  };
}

function validateParameters(expected: number, received: number) {
  if (expected !== received) {
    throw new Error(`SQL statement expects ${expected} values, received ${received}`);
  }
}
