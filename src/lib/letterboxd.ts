export type DiaryRow = {
  name: string;
  year: number | null;
  rating: number | null;
  watchedAt: string;
};

function splitLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (character === "," && !quoted) {
      cells.push(current);
      current = "";

      continue;
    }

    current += character;
  }

  cells.push(current);

  return cells.map((cell) => cell.trim());
}

function toRating(value: string) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(5, Math.max(1, Math.round(parsed)));
}

export function parseLetterboxdCsv(text: string): DiaryRow[] {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const header = splitLine(lines[0] ?? "").map((cell) => cell.toLowerCase());
  const nameAt = header.indexOf("name");
  const yearAt = header.indexOf("year");
  const ratingAt = header.indexOf("rating");
  const watchedAt = header.indexOf("watched date");
  const dateAt = header.indexOf("date");

  if (nameAt === -1) {
    return [];
  }

  const rows: DiaryRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const name = cells[nameAt] ?? "";

    if (!name) {
      continue;
    }

    const year = Number.parseInt(cells[yearAt] ?? "", 10);
    const stamp = (watchedAt >= 0 ? cells[watchedAt] : "") || (dateAt >= 0 ? cells[dateAt] : "");

    rows.push({
      name: name.slice(0, 160),
      year: Number.isInteger(year) ? year : null,
      rating: ratingAt >= 0 ? toRating(cells[ratingAt] ?? "") : null,
      watchedAt: /^\d{4}-\d{2}-\d{2}$/u.test(stamp ?? "") ? stamp : "",
    });
  }

  return rows;
}

export function dedupeRows(rows: DiaryRow[]) {
  const byKey = new Map<string, DiaryRow>();

  for (const row of rows) {
    const key = `${row.name.toLowerCase()}::${row.year ?? ""}`;
    const existing = byKey.get(key);

    if (!existing || (row.rating !== null && existing.rating === null)) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}
