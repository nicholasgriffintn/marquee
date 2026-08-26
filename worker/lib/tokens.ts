export function randomHex(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
