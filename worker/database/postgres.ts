import { Client, types } from "pg";

import type { Database, DatabaseResult, DatabaseTransaction, DatabaseValue } from "./types.ts";

const POSTGRES_BIGINT = 20;
const POSTGRES_DATE = 1082;
const POSTGRES_TIMESTAMP = 1114;
const POSTGRES_TIMESTAMPTZ = 1184;

types.setTypeParser(POSTGRES_BIGINT, (value) => Number(value));
types.setTypeParser(POSTGRES_DATE, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMP, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMPTZ, (value) => value);

class PostgresTransaction implements DatabaseTransaction {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  async query<T extends object = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    const result = await this.#client.query(sql, values);

    return toResult<T>(result.rows, result.rowCount);
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

export class PostgresDatabase extends PostgresTransaction implements Database {
  readonly #client: Client;

  private constructor(client: Client) {
    super(client);
    this.#client = client;
  }

  static async connect(connectionString: string) {
    const client = new Client({ connectionString });

    await client.connect();

    return new PostgresDatabase(client);
  }

  async transaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>) {
    try {
      await this.#client.query("BEGIN");

      const result = await operation(new PostgresTransaction(this.#client));

      await this.#client.query("COMMIT");

      return result;
    } catch (error) {
      await this.#client.query("ROLLBACK");
      throw error;
    }
  }

  close() {
    return this.#client.end();
  }
}

function toResult<T extends object>(rows: T[], rowCount: number | null): DatabaseResult<T> {
  return { rows, rowCount: rowCount ?? 0 };
}
