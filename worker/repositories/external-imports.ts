export type ExternalImport = {
  id: string;
  version: string;
  entries: number;
  mapped: number;
  written: number;
  status: "running" | "completed" | "rejected" | "failed";
};

const COLUMNS = `id, version, entries, mapped, written, status`;

export async function readLastImport(db: Database, source: string, dataset: string) {
  return db.first<ExternalImport>(
    `SELECT ${COLUMNS}
       FROM external_imports
       WHERE source = $1 AND dataset = $2 AND status = 'completed'
       ORDER BY started_at DESC
       LIMIT 1`,
    [source, dataset],
  );
}

export async function readRunningImport(db: Database, source: string, dataset: string) {
  return db.first<ExternalImport>(
    `SELECT ${COLUMNS}
       FROM external_imports
       WHERE source = $1 AND dataset = $2 AND status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
    [source, dataset],
  );
}

export async function startImport(
  db: Database,
  source: string,
  dataset: string,
  version: string,
  entries: number,
  mapped: number,
) {
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO external_imports (id, source, dataset, version, entries, mapped, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'running')`,
    [id, source, dataset, version, entries, mapped],
  );

  return id;
}

export async function advanceImport(db: Database, id: string, written: number) {
  await db.execute(`UPDATE external_imports SET written = written + $1 WHERE id = $2`, [
    written,
    id,
  ]);
}

export async function finishImport(
  db: Database,
  id: string,
  status: ExternalImport["status"],
  detail: string | null = null,
) {
  await db.execute(
    `UPDATE external_imports
       SET status = $1, detail = $2, finished_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
    [status, detail, id],
  );
}

export async function recordRejectedImport(
  db: Database,
  source: string,
  dataset: string,
  version: string,
  entries: number,
  mapped: number,
  detail: string,
) {
  await db.execute(
    `INSERT INTO external_imports
         (id, source, dataset, version, entries, mapped, status, detail, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'rejected', $7, CURRENT_TIMESTAMP)`,
    [crypto.randomUUID(), source, dataset, version, entries, mapped, detail.slice(0, 300)],
  );
}
