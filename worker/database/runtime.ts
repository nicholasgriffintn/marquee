import { PostgresDatabase } from "./postgres.ts";
import type { Database } from "./types.ts";

export type HyperdriveBinding = {
  connectionString: string;
};

export type DatabaseBinding = {
  HYPERDRIVE: HyperdriveBinding;
};

export type WithDatabase<Environment extends DatabaseBinding> = Environment & {
  DB: Database;
};

export function openDatabase<Environment extends DatabaseBinding>(env: Environment) {
  const database = new PostgresDatabase(env.HYPERDRIVE.connectionString);
  const runtime: WithDatabase<Environment> = { ...env, DB: database };

  return { database, runtime };
}
