export async function sha256Hex(value: string, bytes?: number) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)]
    .slice(0, bytes ?? 32)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
