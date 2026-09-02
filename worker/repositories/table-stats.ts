const TABLE_NAME = /^[a-z_][a-z0-9_]*$/u;

export async function estimateTableRows(db: Database, table: string) {
  if (!TABLE_NAME.test(table)) {
    return 0;
  }

  const row = await db.first<{ rows: number }>(
    `SELECT GREATEST(reltuples, 0)::bigint AS rows FROM pg_class WHERE oid = CAST($1 AS regclass)`,
    [`public.${table}`],
  );

  return row?.rows ?? 0;
}
