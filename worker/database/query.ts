type CompiledQuery = {
  text: string;
  parameterCount: number;
};

export function compileQuery(sql: string): CompiledQuery {
  let text = "";
  let nextParameter = 1;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (character === "'" || character === '"') {
      const quoted = readQuoted(sql, index, character);

      text += quoted.value;
      index = quoted.end;
      continue;
    }

    if (character === "-" && next === "-") {
      const comment = readUntil(sql, index, "\n");

      text += comment.value;
      index = comment.end;
      continue;
    }

    if (character === "/" && next === "*") {
      const comment = readUntil(sql, index, "*/");

      text += comment.value;
      index = comment.end;
      continue;
    }

    if (character !== "?") {
      text += character;
      continue;
    }

    let digitEnd = index + 1;

    while (/\d/.test(sql[digitEnd] ?? "")) {
      digitEnd += 1;
    }

    const explicit = sql.slice(index + 1, digitEnd);
    const parameter = explicit ? Number(explicit) : nextParameter;

    if (!Number.isSafeInteger(parameter) || parameter < 1) {
      throw new Error(`Invalid SQL parameter near offset ${index}`);
    }

    text += `$${parameter}`;
    nextParameter = Math.max(nextParameter, parameter + 1);
    index = digitEnd - 1;
  }

  return { text, parameterCount: nextParameter - 1 };
}

function readQuoted(sql: string, start: number, quote: string) {
  let end = start + 1;

  while (end < sql.length) {
    if (sql[end] !== quote) {
      end += 1;
      continue;
    }

    if (sql[end + 1] === quote) {
      end += 2;
      continue;
    }

    return { value: sql.slice(start, end + 1), end };
  }

  throw new Error(`Unterminated SQL quote near offset ${start}`);
}

function readUntil(sql: string, start: number, delimiter: string) {
  const found = sql.indexOf(delimiter, start + delimiter.length);
  const end = found < 0 ? sql.length - 1 : found + delimiter.length - 1;

  return { value: sql.slice(start, end + 1), end };
}
