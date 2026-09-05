import type { MagicLinkDestination } from "../auth/authentication.ts";

export function magicLinkUrl(origin: string, destination: MagicLinkDestination, token: string) {
  const url = new URL(
    destination.kind === "native" ? "/api/auth/native/magic" : "/api/auth/magic",
    origin,
  );

  url.searchParams.set("token", token);
  if (destination.kind === "native") {
    url.searchParams.set("challenge", destination.challenge);
  }

  return url.href;
}

export function nativeCallbackUrl(parameters: Record<string, string>) {
  const url = new URL("marquee://auth/callback");

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  return url;
}
