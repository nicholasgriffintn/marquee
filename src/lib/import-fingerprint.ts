export async function importFingerprint(value: string) {
  const bytes = new TextEncoder().encode(value.replaceAll("\r\n", "\n").trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sourceEventId(parts: readonly (string | number | null | undefined)[]) {
  return importFingerprint(
    parts
      .map((part) =>
        String(part ?? "")
          .trim()
          .toLowerCase(),
      )
      .join("\u001f"),
  );
}
