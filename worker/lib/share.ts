import { collectionPath, titlePath, type MediaTitle } from "../../src/domain/catalog.ts";
import { revivalPath, runtimeLabel, type RevivalWork } from "../../src/domain/revival.ts";
import { sentenceList } from "../../src/lib/string.ts";
import { readCollectionTitleIds, readItems } from "../repositories/catalog-reader.ts";
import { readPerson } from "../repositories/people.ts";
import { readWork } from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";
import { withKvCache } from "./cache.ts";
import { isKnownTitle } from "./validation.ts";

export type PageCard = {
  title: string;
  description: string;
  image: string | null;
  canonical: string;
  ogType: string;
  structuredData: string[];
  index: boolean;
};

const CARD_CACHE_SECONDS = 3_600;
const NAMED_SERVICES = 3;
const FACET_PARAMS = new Set(["type", "genres", "providers"]);

const LISTING_KINDS: Record<string, { one: string; many: string }> = {
  movie: { one: "film", many: "films" },
  tv: { one: "TV series", many: "TV series" },
  all: { one: "film or TV series", many: "films and TV" },
};

export const NOINDEX_PATHS = new Set(["/search", "/sign-in", "/shelf", "/admin", "/notebook"]);

const STATIC_CARDS: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Marquee — what to watch tonight, across every service you pay for",
    description:
      "Search live UK streaming, ask for a recommendation in plain English, and keep a shelf of what you have watched.",
  },
  "/this-week": {
    title: "This week — new arrivals and returning series · Marquee",
    description:
      "What lands on your services this week, what comes back, and what the town is reading about. Printed every Monday.",
  },
  "/sources": {
    title: "Where Marquee's data comes from — every service and source · Marquee",
    description:
      "Every streaming service Marquee tracks, how much it can see inside each one, and credit to everyone whose data makes it work.",
  },
  "/usher": {
    title: "The Usher — thirty years on the door · Marquee",
    description: "Who the Usher is, and why he has opinions about what you should watch tonight.",
  },
  "/revival": {
    title: "The revival house — free public domain films to watch online · Marquee",
    description:
      "Out-of-copyright films streaming free in the UK. No account, no advert, no ticket — just press play.",
  },
};

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function absolute(url: string | null, origin: string) {
  if (!url) {
    return null;
  }

  return url.startsWith("/") ? `${origin}${url}` : url;
}

function ldJson(data: Record<string, unknown>) {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function kindLabel(title: MediaTitle) {
  return title.mediaType === "movie" ? "film" : "TV series";
}

function yearSuffix(year: number | null) {
  return year ? ` (${year})` : "";
}

function breadcrumbs(origin: string, trail: { name: string; item: string }[]) {
  return ldJson({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Marquee", item: `${origin}/` }, ...trail].map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  });
}

function offersFor(title: MediaTitle, url: string) {
  return title.providers.slice(0, 12).map((provider) => ({
    "@type": "WatchAction",
    target: provider.webUrl ?? url,
    expectsAcceptanceOf: {
      "@type": "Offer",
      availableAtOrFrom: { "@type": "Organization", name: provider.name },
      category: provider.offerTypes[0] ?? "subscription",
      ...(provider.offerTypes.includes("free") ? { price: 0, priceCurrency: "GBP" } : {}),
    },
  }));
}

function titleStructuredData(title: MediaTitle, url: string, origin: string) {
  const isMovie = title.mediaType === "movie";
  const image = absolute(title.posterUrl, origin);
  const sameAs = [title.tmdbUrl, title.imdbUrl].filter(Boolean);

  return ldJson({
    "@context": "https://schema.org",
    "@type": isMovie ? "Movie" : "TVSeries",
    name: title.title,
    url,
    ...(image ? { image } : {}),
    ...(title.overview ? { description: title.overview } : {}),
    ...(title.genres.length ? { genre: title.genres } : {}),
    ...(title.releaseDate ? { datePublished: title.releaseDate } : {}),
    ...(title.certification ? { contentRating: title.certification } : {}),
    ...(title.originalTitle && title.originalTitle !== title.title
      ? { alternateName: title.originalTitle }
      : {}),
    ...(isMovie && title.runtimeMinutes ? { duration: `PT${title.runtimeMinutes}M` } : {}),
    ...(!isMovie && title.numberOfSeasons ? { numberOfSeasons: title.numberOfSeasons } : {}),
    ...(!isMovie && title.episodeCount ? { numberOfEpisodes: title.episodeCount } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(title.providers.length ? { potentialAction: offersFor(title, url) } : {}),
    ...(title.tmdbScore && title.tmdbVoteCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: title.tmdbScore,
            bestRating: 10,
            worstRating: 1,
            ratingCount: title.tmdbVoteCount,
          },
        }
      : {}),
  });
}

function titleDescription(title: MediaTitle) {
  const services = title.providers.map((provider) => provider.name).slice(0, NAMED_SERVICES);

  if (services.length) {
    return `Watch ${title.title} on ${sentenceList(services)}. UK streaming, rent and buy prices, cinema showings and free options, checked daily.`;
  }

  return `${title.title} is not on a UK service right now. Marquee watches every service and lists rent, buy, cinema and free options for this ${kindLabel(title)} as they land.`;
}

async function titleCard(env: Bindings, titleId: string, origin: string): Promise<PageCard | null> {
  if (!isKnownTitle(titleId)) {
    return null;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    return null;
  }

  const url = `${origin}${titlePath(title)}`;

  return {
    title: `Where to watch ${title.title}${yearSuffix(title.year)} — ${kindLabel(title)} streaming in the UK · Marquee`,
    description: titleDescription(title),
    image: `${origin}/media/og/${encodeURIComponent(titleId)}.png`,
    canonical: url,
    ogType: "video.other",
    index: true,
    structuredData: [
      titleStructuredData(title, url, origin),
      breadcrumbs(origin, [
        {
          name: title.mediaType === "movie" ? "Films" : "Series",
          item: `${origin}/listings?type=${title.mediaType}`,
        },
        { name: title.title, item: url },
      ]),
    ],
  };
}

async function personCard(
  env: Bindings,
  identifier: string,
  origin: string,
): Promise<PageCard | null> {
  const person = await readPerson(env.DB, identifier);

  if (!person) {
    return null;
  }

  const url = `${origin}/person/${person.personId}`;
  const count = person.titles > 0 ? `${person.titles.toLocaleString("en-GB")} ` : "";

  return {
    title: `${person.name} — every film and TV series, and where to stream them · Marquee`,
    description: `All ${count}${person.name} titles in the catalogue, with UK streaming, rent and buy options for each one.`,
    image: null,
    canonical: url,
    ogType: "profile",
    index: person.titles > 0,
    structuredData: [
      ldJson({
        "@context": "https://schema.org",
        "@type": "Person",
        name: person.name,
        url,
      }),
      breadcrumbs(origin, [{ name: person.name, item: url }]),
    ],
  };
}

async function collectionCard(
  env: Bindings,
  collectionId: number,
  origin: string,
): Promise<PageCard | null> {
  const ids = await readCollectionTitleIds(env.DB, collectionId, 48);

  if (ids.length === 0) {
    return null;
  }

  const items = await readItems(env.DB, ids, 48);
  const name = items[0]?.collection?.name ?? "Collection";
  const url = `${origin}${collectionPath(collectionId)}`;
  const plural = items.length === 1 ? "film" : "films";

  return {
    title: `${name} — every film in order, and where to watch · Marquee`,
    description: `All ${items.length} ${plural} in ${name}, in release order, with UK streaming and rent options for each.`,
    image: absolute(items[0]?.posterUrl ?? null, origin),
    canonical: url,
    ogType: "website",
    index: items.length > 1,
    structuredData: [
      ldJson({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name,
        url,
        numberOfItems: items.length,
        itemListElement: items.slice(0, 24).map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.title,
          url: `${origin}${titlePath(item)}`,
        })),
      }),
      breadcrumbs(origin, [{ name, item: url }]),
    ],
  };
}

function revivalStructuredData(work: RevivalWork, url: string, origin: string) {
  return ldJson({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: work.title,
    url,
    ...(work.synopsis ? { description: work.synopsis } : {}),
    ...(work.stillUrl ? { thumbnailUrl: absolute(work.stillUrl, origin) } : {}),
    ...(work.year ? { datePublished: String(work.year) } : {}),
    ...(work.director ? { director: { "@type": "Person", name: work.director } } : {}),
    ...(work.runtimeSeconds ? { duration: `PT${Math.round(work.runtimeSeconds / 60)}M` } : {}),
    isAccessibleForFree: true,
    contentUrl: work.reelUrl,
  });
}

async function revivalWorkCard(
  env: Bindings,
  workId: string,
  origin: string,
): Promise<PageCard | null> {
  const work = await readWork(env.DB, workId);

  if (!work) {
    return null;
  }

  const url = `${origin}${revivalPath(work)}`;
  const runtime = runtimeLabel(work.runtimeSeconds);

  return {
    title: `Watch ${work.title}${yearSuffix(work.year)} free — public domain film · Marquee`,
    description: `${work.title} streams free in the revival house${runtime ? `, ${runtime}` : ""}. Out of UK copyright, no account and no advert.`,
    image: absolute(work.stillUrl, origin),
    canonical: url,
    ogType: "video.movie",
    index: true,
    structuredData: [
      revivalStructuredData(work, url, origin),
      breadcrumbs(origin, [
        { name: "Revival house", item: `${origin}/revival` },
        { name: work.title, item: url },
      ]),
    ],
  };
}

async function providerName(env: Bindings, providerId: string) {
  const row = await env.DB.first<{ name: string }>(
    "SELECT name FROM catalog_title_providers WHERE provider_id = $1 LIMIT 1",
    [providerId],
  );

  return row?.name ?? null;
}

function selected(url: URL, key: string) {
  return url.searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function listingsCard(env: Bindings, url: URL, origin: string): Promise<PageCard> {
  const type = url.searchParams.get("type");
  const genres = selected(url, "genres");
  const providers = selected(url, "providers");
  const extras = [...url.searchParams.keys()].filter((key) => !FACET_PARAMS.has(key));
  const kind = LISTING_KINDS[type === "movie" || type === "tv" ? type : "all"];
  const genre = genres.length === 1 ? genres[0] : null;
  const service = providers.length === 1 ? await providerName(env, providers[0]) : null;
  const isFacet =
    extras.length === 0 && genres.length <= 1 && (providers.length === 0 || Boolean(service));
  const facets = new URLSearchParams();

  if (type === "movie" || type === "tv") {
    facets.set("type", type);
  }

  if (genre) {
    facets.set("genres", genre);
  }

  if (service) {
    facets.set("providers", providers[0]);
  }

  const query = facets.toString();
  const canonical = `${origin}/listings${query ? `?${query}` : ""}`;
  const label = genre ? `${genre.toLowerCase()} ` : "";
  const heading = capitalise(`${label}${kind.many}`);
  const named = service ? `${heading} on ${service}` : heading;

  return {
    title: `${service ? named : `${heading} to stream in the UK`} · Marquee`,
    description: service
      ? `Every ${label}${kind.one} on ${service} in the UK right now, ranked, with what it costs elsewhere if you do not subscribe.`
      : `Every ${label}${kind.one} streaming in the UK right now, across every service, ranked and filterable by tag, service and where it was shot.`,
    image: null,
    canonical,
    ogType: "website",
    index: isFacet,
    structuredData: [breadcrumbs(origin, [{ name: named, item: canonical }])],
  };
}

const DIRECTORY_CARDS = {
  people: {
    title: "Every actor, director and writer in the catalogue · Marquee",
    description:
      "Every name on the credits at Marquee, with everything we hold for each one and where to stream it in the UK.",
  },
  collections: {
    title: "Every film collection, in release order · Marquee",
    description:
      "Every collection in the Marquee catalogue — sequels, trilogies and long-running series — each one in release order with UK streaming options.",
  },
};

function directoryCard(url: URL, origin: string): PageCard {
  const collections = url.searchParams.get("tab") === "collections";
  const copy = collections ? DIRECTORY_CARDS.collections : DIRECTORY_CARDS.people;
  const canonical = `${origin}/directory${collections ? "?tab=collections" : ""}`;

  return {
    title: copy.title,
    description: copy.description,
    image: null,
    canonical,
    ogType: "website",
    index: !url.searchParams.get("q"),
    structuredData: [
      breadcrumbs(
        origin,
        collections
          ? [
              { name: "The index", item: `${origin}/directory` },
              { name: "Collections", item: canonical },
            ]
          : [{ name: "The index", item: canonical }],
      ),
    ],
  };
}

function staticCard(path: string, origin: string): PageCard | null {
  const copy = STATIC_CARDS[path];

  if (!copy) {
    return null;
  }

  return {
    title: copy.title,
    description: copy.description,
    image: null,
    canonical: `${origin}${path}`,
    ogType: "website",
    index: true,
    structuredData: [],
  };
}

function cachedCard(env: Bindings, key: string, build: () => Promise<PageCard | null>) {
  return withKvCache(env, `share-card:${key}`, CARD_CACHE_SECONDS, build);
}

export async function cardFor(env: Bindings, url: URL, origin: string): Promise<PageCard | null> {
  const path = url.pathname;
  const routed = /^\/(movie|tv)\/([1-9][0-9]*)(?:\/|$)/u.exec(path);

  if (routed) {
    const titleId = `${routed[1]}:${routed[2]}`;

    return cachedCard(env, `${origin}:title:${titleId}`, () => titleCard(env, titleId, origin));
  }

  const legacy = /^\/title\/([^/?#]+)/u.exec(path);

  if (legacy) {
    const titleId = decodeURIComponent(legacy[1]);

    return cachedCard(env, `${origin}:title:${titleId}`, () => titleCard(env, titleId, origin));
  }

  const person = /^\/person\/([^/?#]+)/u.exec(path);

  if (person) {
    const personId = decodeURIComponent(person[1]);

    return cachedCard(env, `${origin}:person:${personId}`, () => personCard(env, personId, origin));
  }

  const collection = /^\/collection\/([1-9][0-9]*)/u.exec(path);

  if (collection) {
    const collectionId = Number(collection[1]);

    return cachedCard(env, `${origin}:collection:${collectionId}`, () =>
      collectionCard(env, collectionId, origin),
    );
  }

  const revival = /^\/revival\/([^/?#]+)/u.exec(path);

  if (revival) {
    const workId = decodeURIComponent(revival[1]);

    return cachedCard(env, `${origin}:revival:${workId}`, () =>
      revivalWorkCard(env, workId, origin),
    );
  }

  if (path === "/listings") {
    return listingsCard(env, url, origin);
  }

  if (path === "/directory") {
    return directoryCard(url, origin);
  }

  return staticCard(path, origin);
}

export async function withPageMetadata(
  env: Bindings,
  response: Response,
  url: URL,
  origin: string,
) {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    return response;
  }

  const card = await cardFor(env, url, origin).catch(() => null);
  const canonical = card ? card.canonical : `${origin}${url.pathname}`;
  const noindex = card ? !card.index : NOINDEX_PATHS.has(url.pathname);
  const head = [
    `<link rel="canonical" href="${escapeAttribute(canonical)}">`,
    noindex ? `<meta name="robots" content="noindex, follow">` : "",
    card
      ? [
          `<meta property="og:type" content="${escapeAttribute(card.ogType)}">`,
          `<meta property="og:title" content="${escapeAttribute(card.title)}">`,
          `<meta property="og:description" content="${escapeAttribute(card.description)}">`,
          `<meta property="og:url" content="${escapeAttribute(card.canonical)}">`,
          card.image ? `<meta property="og:image" content="${escapeAttribute(card.image)}">` : "",
          `<meta name="twitter:card" content="summary_large_image">`,
          `<meta name="twitter:title" content="${escapeAttribute(card.title)}">`,
          `<meta name="twitter:description" content="${escapeAttribute(card.description)}">`,
          card.image ? `<meta name="twitter:image" content="${escapeAttribute(card.image)}">` : "",
          ...card.structuredData.map(
            (data) => `<script type="application/ld+json">${data}</script>`,
          ),
        ].join("")
      : "",
  ]
    .filter(Boolean)
    .join("");

  return new HTMLRewriter()
    .on('link[rel="canonical"]', {
      element(element) {
        element.remove();
      },
    })
    .on('meta[name="robots"]', {
      element(element) {
        element.remove();
      },
    })
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(element) {
        const content = element.getAttribute("content");

        if (content?.startsWith("/")) {
          element.setAttribute("content", `${origin}${content}`);
        }
      },
    })
    .on('meta[property^="og:"]', {
      element(element) {
        if (card) {
          element.remove();
        }
      },
    })
    .on('meta[name^="twitter:"]', {
      element(element) {
        if (card) {
          element.remove();
        }
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        if (card) {
          element.setAttribute("content", card.description);
        }
      },
    })
    .on("title", {
      element(element) {
        if (card) {
          element.setInnerContent(card.title);
        }
      },
    })
    .on("head", {
      element(element) {
        element.append(head, { html: true });
      },
    })
    .transform(response);
}
