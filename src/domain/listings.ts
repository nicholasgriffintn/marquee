export type ListingType = "movie" | "tv" | null;

const KINDS = {
  movie: { one: "film", many: "films" },
  tv: { one: "TV series", many: "TV series" },
  all: { one: "film or TV series", many: "films and TV" },
};

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function listingCopy({
  type,
  genre,
  service,
}: {
  type: ListingType;
  genre: string | null;
  service: string | null;
}) {
  const kind = KINDS[type ?? "all"];
  const label = genre ? `${genre.toLowerCase()} ` : "";
  const heading = capitalise(`${label}${kind.many}`);
  const named = service ? `${heading} on ${service}` : heading;

  return {
    heading: named,
    title: service ? named : `${heading} to stream in the UK`,
    description: service
      ? `Every ${label}${kind.one} on ${service} in the UK right now, ranked, with what it costs elsewhere if you do not subscribe.`
      : `Every ${label}${kind.one} streaming in the UK right now, across every service, ranked and filterable by tag, service and where it was shot.`,
  };
}

export function listingPath(type: ListingType, facets: Record<string, string>) {
  const query = new URLSearchParams();

  if (type) {
    query.set("type", type);
  }

  for (const [key, value] of Object.entries(facets)) {
    if (value) {
      query.set(key, value);
    }
  }

  const search = query.toString();

  return `/listings${search ? `?${search}` : ""}`;
}
