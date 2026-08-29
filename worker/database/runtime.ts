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

export async function openDatabase<Environment extends DatabaseBinding>(env: Environment) {
  const database = await PostgresDatabase.connect(env.HYPERDRIVE.connectionString);
  const runtime: WithDatabase<Environment> = { ...env, DB: database };

  return { database, runtime };
}

export async function withDatabase<Environment extends DatabaseBinding, Result>(
  env: Environment,
  operation: (runtime: WithDatabase<Environment>) => Promise<Result>,
) {
  const { database, runtime } = await openDatabase(env);

  try {
    return await operation(runtime);
  } finally {
    await database.close();
  }
}
