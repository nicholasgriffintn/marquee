import type { RevivalSource } from "../../src/domain/revival.ts";

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".corp",
  ".home.arpa",
  ".onion",
  ".example",
  ".invalid",
  ".test",
];

type RevivalFetchInit = NonNullable<Parameters<typeof fetch>[1]>;

function normalizedContentType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function safeFallback(value: string, allowed: Set<string>, fallback: string) {
  const contentType = normalizedContentType(value);

  return allowed.has(contentType) ? contentType : fallback;
}

function trustedContentType(value: string | null, allowed: Set<string>, fallback: string) {
  const contentType = normalizedContentType(value);

  if (!contentType || contentType === "application/octet-stream") {
    return fallback;
  }

  if (!allowed.has(contentType)) {
    throw new Error("revival source returned an unsupported content type");
  }

  return contentType;
}

export function revivalVideoContentType(value: string | null, fallback = "video/mp4") {
  const fallbackType = safeFallback(fallback, VIDEO_CONTENT_TYPES, "video/mp4");

  return trustedContentType(value, VIDEO_CONTENT_TYPES, fallbackType);
}

export function revivalImageContentType(value: string | null) {
  return trustedContentType(value, IMAGE_CONTENT_TYPES, "image/jpeg");
}

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/\.$/u, "");
}

function isPublicHostname(hostname: string) {
  if (!hostname.includes(".") || hostname.startsWith("[") || /^\d+(?:\.\d+){3}$/u.test(hostname)) {
    return false;
  }

  return !BLOCKED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

function isHostWithin(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isTrustedRevivalSourceUrl(source: RevivalSource, value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = normalizedHostname(url);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !isPublicHostname(hostname)
    ) {
      return false;
    }

    if (source === "archive") {
      return isHostWithin(hostname, "archive.org");
    }

    if (source === "loc") {
      return isHostWithin(hostname, "loc.gov");
    }

    return source === "europeana";
  } catch {
    return false;
  }
}

export async function fetchRevivalSource(
  source: RevivalSource,
  value: string,
  init: RevivalFetchInit,
) {
  let url = value;
  let europeanaHostname: string | null = null;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!isTrustedRevivalSourceUrl(source, url)) {
      throw new Error("revival source URL is not trusted");
    }

    const hostname = normalizedHostname(new URL(url));

    if (source === "europeana") {
      europeanaHostname ??= hostname;

      if (hostname !== europeanaHostname) {
        throw new Error("Europeana source redirected to a different host");
      }
    }

    // Redirects are handled here so every destination crosses the same trust boundary.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetch(url, { ...init, redirect: "manual" });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location || redirects === MAX_REDIRECTS) {
      // oxlint-disable-next-line no-await-in-loop
      await response.body?.cancel();
      throw new Error("revival source redirect could not be followed safely");
    }

    const destination = new URL(location, url).href;

    // oxlint-disable-next-line no-await-in-loop
    await response.body?.cancel();
    url = destination;
  }

  throw new Error("revival source redirect limit exceeded");
}
