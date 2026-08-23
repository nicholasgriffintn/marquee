import { titlePath, type MediaTitle } from "../../src/domain/catalog.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";
import { isKnownTitle } from "./validation.ts";

type ShareCard = {
  title: string;
  description: string;
  image: string | null;
  url: string;
  structuredData: string;
};

const CANONICAL_PARAMS: Record<string, string[]> = {
  "/listings": ["genres", "keywords", "providers", "q", "sort", "type"],
  "/search": ["q"],
};

const NOINDEX_PATHS = new Set(["/search", "/sign-in", "/shelf", "/admin"]);

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

function structuredDataFor(title: MediaTitle, url: string, origin: string) {
  const isMovie = title.mediaType === "movie";
  const image = absolute(title.posterUrl, origin);
  const sameAs = [title.tmdbUrl, title.imdbUrl].filter(Boolean);
  const data: Record<string, unknown> = {
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
  };

  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

async function cardFor(env: Bindings, path: string, origin: string): Promise<ShareCard | null> {
  const routed = /^\/(movie|tv)\/([1-9][0-9]*)(?:\/|$)/u.exec(path);
  const legacy = /^\/title\/([^/?#]+)/u.exec(path);

  if (!routed && !legacy) {
    return null;
  }

  const titleId = routed ? `${routed[1]}:${routed[2]}` : decodeURIComponent(legacy?.[1] ?? "");

  if (!isKnownTitle(titleId)) {
    return null;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    return null;
  }

  const services = title.providers.map((provider) => provider.name).slice(0, 3);
  const url = `${origin}${titlePath(title)}`;

  return {
    title: `${title.title}${title.year ? ` (${title.year})` : ""} · Marquee`,
    description:
      title.overview.slice(0, 200) ||
      `${title.genres.join(", ")}${services.length ? ` · on ${services.join(", ")}` : ""}`,
    image: `${origin}/media/og/${encodeURIComponent(titleId)}.png`,
    url,
    structuredData: structuredDataFor(title, url, origin),
  };
}

function canonicalFor(url: URL, origin: string) {
  const params = new URLSearchParams();

  for (const key of CANONICAL_PARAMS[url.pathname] ?? []) {
    const value = url.searchParams.get(key)?.trim();

    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return `${origin}${url.pathname}${query ? `?${query}` : ""}`;
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

  const card = await cardFor(env, url.pathname, origin).catch(() => null);
  const canonical = card ? card.url : canonicalFor(url, origin);
  const head = [
    `<link rel="canonical" href="${escapeAttribute(canonical)}">`,
    !card && NOINDEX_PATHS.has(url.pathname)
      ? `<meta name="robots" content="noindex, follow">`
      : "",
    card
      ? [
          `<meta property="og:type" content="video.other">`,
          `<meta property="og:title" content="${escapeAttribute(card.title)}">`,
          `<meta property="og:description" content="${escapeAttribute(card.description)}">`,
          `<meta property="og:url" content="${escapeAttribute(card.url)}">`,
          card.image ? `<meta property="og:image" content="${escapeAttribute(card.image)}">` : "",
          `<meta name="twitter:card" content="summary_large_image">`,
          `<meta name="twitter:title" content="${escapeAttribute(card.title)}">`,
          `<meta name="twitter:description" content="${escapeAttribute(card.description)}">`,
          card.image ? `<meta name="twitter:image" content="${escapeAttribute(card.image)}">` : "",
          `<script type="application/ld+json">${card.structuredData}</script>`,
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
