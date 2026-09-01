export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }

      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

export function csvObjects(text: string) {
  const [header = [], ...rows] = parseCsv(text);
  const keys = header.map((cell) => cell.trim().toLowerCase());

  return rows.map((cells) =>
    Object.fromEntries(keys.map((key, index) => [key, cells[index]?.trim() ?? ""])),
  );
}
