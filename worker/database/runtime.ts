import { flushUpstreamUsage } from "../lib/upstream-usage.ts";
import { LazyDatabase } from "./lazy.ts";
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
  const database = new LazyDatabase(env.HYPERDRIVE.connectionString);
  const runtime: WithDatabase<Environment> = { ...env, DB: database };

  return { database, runtime };
}

export async function withDatabase<Environment extends DatabaseBinding, Result>(
  env: Environment,
  operation: (runtime: WithDatabase<Environment>) => Promise<Result>,
) {
  const { database, runtime } = openDatabase(env);

  try {
    return await operation(runtime);
  } finally {
    await flushUpstreamUsage(runtime);
    await database.close();
  }
}
