export function canonicalOrigin(request: Request, configured?: string) {
  return new URL(configured?.trim() || request.url).origin;
}

export function safeReturnPath(value: string | undefined) {
  if (
    !value ||
    value.length > 1_024 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return undefined;
  }

  return value;
}
