import { PostgresDatabase } from "./postgres.ts";
import type { Database, DatabaseTransaction, DatabaseValue } from "./types.ts";

export class LazyDatabase implements Database {
  readonly #connectionString: string;
  #opening: Promise<PostgresDatabase> | null = null;

  constructor(connectionString: string) {
    this.#connectionString = connectionString;
  }

  #open() {
    this.#opening ??= PostgresDatabase.connect(this.#connectionString);

    return this.#opening;
  }

  async query<T extends object = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    return (await this.#open()).query<T>(sql, values);
  }

  async first<T extends object = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    return (await this.#open()).first<T>(sql, values);
  }

  async execute<T extends object = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ) {
    return (await this.#open()).execute<T>(sql, values);
  }

  async transaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>) {
    return (await this.#open()).transaction(operation);
  }

  async close() {
    const opening = this.#opening;

    if (!opening) {
      return;
    }

    this.#opening = null;

    const database = await opening.catch(() => null);

    await database?.close();
  }
}
