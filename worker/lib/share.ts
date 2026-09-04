import { NO_ACCESS } from "../../src/domain/access.ts";
import { collectionPath, titlePath, type MediaTitle } from "../../src/domain/catalog.ts";
import { editionPath, isWeekOf } from "../../src/domain/edition.ts";
import { listingCopy } from "../../src/domain/listings.ts";
import {
  hubPath,
  hubTitle,
  isHubFamily,
  REVIVAL_TERM_PATH,
  revivalPath,
  runtimeLabel,
  type HubFamily,
  type RevivalWork,
} from "../../src/domain/revival.ts";
import { INDEXABLE_POPULARITY } from "../../src/domain/visibility.ts";
import { sentenceList } from "../../src/lib/string.ts";
import { readCollectionTitleIds, readItems } from "../repositories/catalog-reader.ts";
import { readPerson } from "../repositories/people.ts";
import { countShelf, readWork } from "../repositories/revival.ts";
import { hubLabel, resolveShelf } from "../services/revival.ts";
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
const PROVIDER_NAME_CACHE_SECONDS = 86_400;
const NAMED_SERVICES = 3;
const FACET_PARAMS = new Set(["type", "genres", "providers"]);

export const NOINDEX_PATHS = new Set([
  "/search",
  "/sign-in",
  "/shelf",
  "/admin",
  "/notebook",
  "/screening",
]);

const STATIC_CARDS: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Marquee — what to watch tonight, across every service you pay for",
    description:
      "Search live UK streaming, ask for a recommendation in plain English, and keep a shelf of what you have watched.",
  },
  "/this-week": {
    title: "This week on UK streaming — new arrivals and returning series · Marquee",
    description:
      "What landed on Netflix, Prime Video, Disney+, iPlayer and the rest this week, which series are back, and what the town is reading about. Printed every Monday.",
  },
  [REVIVAL_TERM_PATH]: {
    title: "Why a film can be public domain in America and not in Britain · Marquee",
    description:
      "UK copyright runs seventy years from the death of the last director, writer or composer, not from the release date. How the revival house checks it, with Nosferatu, The Lost World and Metropolis as the worked examples.",
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
  "/tour": {
    title: "The tour — a walk round the building after closing · Marquee",
    description:
      "Nine stops with the Usher and a torch: how the search actually works, how he picks, and what plays on the small screen at the back.",
  },
  "/screening": {
    title: "A screening — the room decides · Marquee",
    description:
      "A shared room with a link: get a ticket, vote when the host opens a poll, and ask the Usher.",
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

  const [title] = await readItems(env.DB, [titleId], NO_ACCESS);

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
    index: title.providers.length > 0 || title.popularity >= INDEXABLE_POPULARITY,
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

  const items = await readItems(env.DB, ids, NO_ACCESS, 48);
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

function providerName(env: Bindings, providerId: string) {
  return withKvCache(env, `provider-name:${providerId}`, PROVIDER_NAME_CACHE_SECONDS, async () => {
    const row = await env.DB.first<{ name: string }>(
      "SELECT name FROM catalog_title_providers WHERE provider_id = $1 LIMIT 1",
      [providerId],
    );

    return row?.name ?? null;
  });
}

async function revivalHubCard(
  env: Bindings,
  family: HubFamily,
  slug: string,
  origin: string,
): Promise<PageCard | null> {
  const [selector, label] = await Promise.all([
    resolveShelf(env, `${family}:${slug}`),
    hubLabel(env, family, slug),
  ]);

  if (!selector || !label) {
    return null;
  }

  const total = await countShelf(env.DB, selector);
  const url = `${origin}${hubPath(family, slug)}`;
  const heading = hubTitle(family, label);
  const plural = total === 1 ? "film" : "films";

  return {
    title: `${heading} — free public domain ${plural} to watch online · Marquee`,
    description: `${total.toLocaleString("en-GB")} out-of-copyright ${plural} ${family === "director" ? `by ${label}` : `from ${heading.toLowerCase()}`}, streaming free in the UK with no account and no advert. Every print carries its provenance.`,
    image: null,
    canonical: url,
    ogType: "website",
    index: total > 0,
    structuredData: [
      breadcrumbs(origin, [
        { name: "Revival house", item: `${origin}/revival` },
        { name: heading, item: url },
      ]),
    ],
  };
}

function editionCard(weekOf: string, origin: string): PageCard {
  const url = `${origin}${editionPath(weekOf)}`;
  const printed = new Date(`${weekOf}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    title: `This week on UK streaming, week of ${printed} · Marquee`,
    description: `What landed on UK streaming services in the week of ${printed}, which series came back, and what the town was reading about.`,
    image: null,
    canonical: url,
    ogType: "article",
    index: true,
    structuredData: [
      breadcrumbs(origin, [
        { name: "This week", item: `${origin}/this-week` },
        { name: `Week of ${printed}`, item: url },
      ]),
    ],
  };
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
  const copy = listingCopy({
    type: type === "movie" || type === "tv" ? type : null,
    genre,
    service,
  });

  return {
    title: `${copy.title} · Marquee`,
    description: copy.description,
    image: null,
    canonical,
    ogType: "website",
    index: isFacet,
    structuredData: [breadcrumbs(origin, [{ name: copy.heading, item: canonical }])],
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
    index: !NOINDEX_PATHS.has(path),
    structuredData: [],
  };
}

function cachedCard(env: Bindings, key: string, build: () => Promise<PageCard | null>) {
  return withKvCache(env, `share-card:${key}`, CARD_CACHE_SECONDS, build);
}

export async function cardFor(env: Bindings, url: URL, origin: string): Promise<PageCard | null> {
  const path = url.pathname;
  const fixed = staticCard(path, origin);

  if (fixed) {
    return fixed;
  }

  const hub = /^\/revival\/shelf\/([a-z]+)\/([^/?#]+)$/u.exec(path);

  if (hub && isHubFamily(hub[1])) {
    const family = hub[1];
    const slug = decodeURIComponent(hub[2]);

    return cachedCard(env, `${origin}:hub:${family}:${slug}`, () =>
      revivalHubCard(env, family, slug, origin),
    );
  }

  const edition = /^\/this-week\/([^/?#]+)$/u.exec(path);

  if (edition) {
    return isWeekOf(edition[1]) ? editionCard(edition[1], origin) : null;
  }

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

  return null;
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
    env.APP_STORE_ID
      ? `<meta name="apple-itunes-app" content="app-id=${escapeAttribute(env.APP_STORE_ID)}">`
      : "",
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
