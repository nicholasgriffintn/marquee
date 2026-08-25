import type { MediaTitle } from "../domain/catalog";

export const SITE_TITLE = "Marquee — Streaming, without the hunt";

const ROUTE_TITLES: Record<string, string> = {
  "/": SITE_TITLE,
  "/listings": "Listings · Marquee",
  "/shelf": "My shelf · Marquee",
  "/this-week": "This week · Marquee",
  "/notebook": "The notebook · Marquee",
  "/revival": "The revival house · Marquee",
  "/sources": "Where it comes from · Marquee",
  "/admin": "Admin · Marquee",
  "/sign-in": "Box office · Marquee",
  "/usher": "The Usher (1974) — Marquee",
  "/films": "Listings · Marquee",
  "/series": "Listings · Marquee",
  "/new": "Listings · Marquee",
  "/popular": "Listings · Marquee",
};

export function titleForItem(item: MediaTitle) {
  return `${item.title}${item.year ? ` (${item.year})` : ""} · Marquee`;
}

const PREFIX_TITLES: [string, string][] = [
  ["/revival/", "The revival house · Marquee"],
  ["/person/", "People · Marquee"],
  ["/collection/", "Collection · Marquee"],
];

export function titleForRoute(pathname: string, query: string) {
  if (pathname === "/search") {
    return query ? `${query} · Search · Marquee` : "Search · Marquee";
  }

  const prefixed = PREFIX_TITLES.find(([prefix]) => pathname.startsWith(prefix));

  return prefixed?.[1] ?? ROUTE_TITLES[pathname] ?? "Not found · Marquee";
}
