export function sentenceList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

export function hashString(value: string) {
  let result = 0;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }

  return result;
}

export function rankingHash(value: string) {
  let result = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }

  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);

  return (result ^ (result >>> 16)) >>> 0;
}

export function normaliseTitle(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}
