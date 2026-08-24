export type ExternalImport = {
  id: string;
  version: string;
  entries: number;
  mapped: number;
  written: number;
  status: "running" | "completed" | "rejected" | "failed";
};

const COLUMNS = `id, version, entries, mapped, written, status`;

export async function readLastImport(db: D1Database, source: string, dataset: string) {
  return db
    .prepare(
      `SELECT ${COLUMNS}
       FROM external_imports
       WHERE source = ? AND dataset = ? AND status = 'completed'
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .bind(source, dataset)
    .first<ExternalImport>();
}

export async function readRunningImport(db: D1Database, source: string, dataset: string) {
  return db
    .prepare(
      `SELECT ${COLUMNS}
       FROM external_imports
       WHERE source = ? AND dataset = ? AND status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .bind(source, dataset)
    .first<ExternalImport>();
}

export async function startImport(
  db: D1Database,
  source: string,
  dataset: string,
  version: string,
  entries: number,
  mapped: number,
) {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO external_imports (id, source, dataset, version, entries, mapped, status)
       VALUES (?, ?, ?, ?, ?, ?, 'running')`,
    )
    .bind(id, source, dataset, version, entries, mapped)
    .run();

  return id;
}

export async function advanceImport(db: D1Database, id: string, written: number) {
  await db
    .prepare(`UPDATE external_imports SET written = written + ? WHERE id = ?`)
    .bind(written, id)
    .run();
}

export async function finishImport(
  db: D1Database,
  id: string,
  status: ExternalImport["status"],
  detail: string | null = null,
) {
  await db
    .prepare(
      `UPDATE external_imports
       SET status = ?, detail = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(status, detail, id)
    .run();
}

export async function recordRejectedImport(
  db: D1Database,
  source: string,
  dataset: string,
  version: string,
  entries: number,
  mapped: number,
  detail: string,
) {
  await db
    .prepare(
      `INSERT INTO external_imports
         (id, source, dataset, version, entries, mapped, status, detail, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, CURRENT_TIMESTAMP)`,
    )
    .bind(crypto.randomUUID(), source, dataset, version, entries, mapped, detail.slice(0, 300))
    .run();
}
