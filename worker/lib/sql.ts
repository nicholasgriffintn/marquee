const TABLE_NAME = /^[a-z_][a-z0-9_]*$/u;

export function estimatedRows(table: string) {
  if (!TABLE_NAME.test(table)) {
    throw new Error(`Unsafe table name: ${table}`);
  }

  return `(SELECT GREATEST(pc.reltuples, 0)::bigint FROM pg_class AS pc WHERE pc.oid = to_regclass('${table}'))`;
}
