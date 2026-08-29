export const READ_CHUNK = 200;

export async function queryChunked<T>(
  ids: string[],
  build: (wave: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];

  for (let index = 0; index < ids.length; index += READ_CHUNK) {
    const wave = ids.slice(index, index + READ_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    out.push(...(await build(wave)));
  }

  return out;
}

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);

    if (list) {
      list.push(row);
    } else {
      map.set(id, [row]);
    }
  }

  return map;
}

export function rowPlaceholders(rows: number, columns: number) {
  return Array.from({ length: rows }, (_unusedRow, row) => {
    const values = Array.from(
      { length: columns },
      (_unusedColumn, column) => `$${row * columns + column + 1}`,
    );

    return `(${values.join(", ")})`;
  }).join(", ");
}

export async function deleteByTitleIds(db: Database, table: string, titleIds: string[]) {
  for (let index = 0; index < titleIds.length; index += READ_CHUNK) {
    const wave = titleIds.slice(index, index + READ_CHUNK);

    // oxlint-disable-next-line no-await-in-loop
    await db.execute(
      `DELETE FROM ${table} WHERE title_id IN (${wave.map((_, offset) => `$${offset + 1}`).join(",")})`,
      [...wave],
    );
  }
}

export async function insertRows(
  db: Database,
  columns: number,
  rowsPerStatement: number,
  rows: DatabaseValue[][],
  statement: (chunk: DatabaseValue[][]) => string,
) {
  if (rows.some((row) => row.length !== columns)) {
    throw new Error(`insertRows: expected every row to have ${columns} columns`);
  }

  const STATEMENTS_PER_BATCH = 10;
  const rowChunk = rowsPerStatement * STATEMENTS_PER_BATCH;

  for (let index = 0; index < rows.length; index += rowChunk) {
    const batchRows = rows.slice(index, index + rowChunk);

    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      for (let offset = 0; offset < batchRows.length; offset += rowsPerStatement) {
        const chunk = batchRows.slice(offset, offset + rowsPerStatement);

        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(statement(chunk), chunk.flat());
      }
    });
  }
}

export type SimpleArrayField = { table: string; column: string };

export async function readSimpleArray(db: Database, entry: SimpleArrayField, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<{ titleId: string; value: string }>(
        `SELECT title_id AS "titleId", ${entry.column} AS value
         FROM ${entry.table}
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})
         ORDER BY title_id, position`,
        [...wave],
      )
      .then((result) => result.rows),
  );

  const grouped = groupBy(rows, (row) => row.titleId);
  const values = new Map<string, string[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map((entry_) => entry_.value),
    );
  }

  return values;
}

export async function writeSimpleArray(
  db: Database,
  entry: SimpleArrayField,
  titles: { titleId: string; values: string[] }[],
) {
  await deleteByTitleIds(
    db,
    entry.table,
    titles.map((title) => title.titleId),
  );

  const rows = titles.flatMap(({ titleId, values }) =>
    [...new Set(values)].map((value, position): DatabaseValue[] => [titleId, value, position]),
  );

  await insertRows(
    db,
    3,
    30,
    rows,
    (chunk) =>
      `INSERT INTO ${entry.table} (title_id, ${entry.column}, position)
       VALUES ${rowPlaceholders(chunk.length, 3)}
       ON CONFLICT (title_id, ${entry.column}) DO UPDATE SET position = excluded.position`,
  );
}

export type KindArrayField = {
  table: string;
  column: string;
  kinds: { kind: string; field: string }[];
};

export async function readKindArray(db: Database, entry: KindArrayField, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<{ titleId: string; kind: string; value: string }>(
        `SELECT title_id AS "titleId", kind, ${entry.column} AS value
         FROM ${entry.table}
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})
         ORDER BY title_id, kind, position`,
        [...wave],
      )
      .then((result) => result.rows),
  );
  const byField = new Map<string, Map<string, string[]>>();

  for (const { field } of entry.kinds) {
    byField.set(field, new Map());
  }

  for (const row of rows) {
    const match = entry.kinds.find((k) => k.kind === row.kind);

    if (!match) {
      continue;
    }

    const forField = byField.get(match.field);

    if (!forField) {
      continue;
    }

    const list = forField.get(row.titleId);

    if (list) {
      list.push(row.value);
    } else {
      forField.set(row.titleId, [row.value]);
    }
  }

  return byField;
}

export async function writeKindArray(
  db: Database,
  entry: KindArrayField,
  titles: { titleId: string; values: Record<string, string[]> }[],
) {
  await deleteByTitleIds(
    db,
    entry.table,
    titles.map((title) => title.titleId),
  );

  const rows = titles.flatMap(({ titleId, values }) =>
    entry.kinds.flatMap(({ kind, field }) =>
      [...new Set(values[field] ?? [])].map((value, position): DatabaseValue[] => [
        titleId,
        kind,
        value,
        position,
      ]),
    ),
  );

  await insertRows(
    db,
    4,
    25,
    rows,
    (chunk) =>
      `INSERT INTO ${entry.table} (title_id, kind, ${entry.column}, position)
       VALUES ${rowPlaceholders(chunk.length, 4)}
       ON CONFLICT (title_id, kind, ${entry.column}) DO UPDATE SET position = excluded.position`,
  );
}
