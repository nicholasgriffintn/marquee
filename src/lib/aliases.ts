export const ROUTE_ALIASES: Record<string, string> = {
  "/search": "/listings",
  "/films": "/listings?type=movie",
  "/series": "/listings?type=tv",
  "/new": "/listings?sort=recent",
  "/popular": "/listings?sort=popularity",
  "/people": "/directory",
  "/person": "/directory",
  "/collections": "/directory?tab=collections",
  "/collection": "/directory?tab=collections",
};

export function aliasTarget(alias: string, search: string) {
  const target = ROUTE_ALIASES[alias];

  if (!target) {
    return null;
  }

  const [path, preset = ""] = target.split("?");
  const merged = new URLSearchParams(search);

  for (const [key, value] of new URLSearchParams(preset)) {
    merged.set(key, value);
  }

  const query = merged.toString();

  return query ? `${path}?${query}` : path;
}
