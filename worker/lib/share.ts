import { titlePath } from "../../src/domain/catalog.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";
import { isKnownTitle } from "./validation.ts";

type ShareCard = {
  title: string;
  description: string;
  image: string | null;
  url: string;
};

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

  return {
    title: `${title.title}${title.year ? ` (${title.year})` : ""} · Marquee`,
    description:
      title.overview.slice(0, 200) ||
      `${title.genres.join(", ")}${services.length ? ` · on ${services.join(", ")}` : ""}`,
    image: `${origin}/media/og/${encodeURIComponent(titleId)}.png`,
    url: `${origin}${titlePath(title)}`,
  };
}

export async function withShareCard(
  env: Bindings,
  response: Response,
  path: string,
  origin: string,
) {
  const card = await cardFor(env, path, origin).catch(() => null);

  if (!card) {
    return response;
  }

  const tags = [
    `<meta property="og:type" content="video.other">`,
    `<meta property="og:title" content="${escapeAttribute(card.title)}">`,
    `<meta property="og:description" content="${escapeAttribute(card.description)}">`,
    `<meta property="og:url" content="${escapeAttribute(card.url)}">`,
    card.image ? `<meta property="og:image" content="${escapeAttribute(card.image)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttribute(card.title)}">`,
    `<meta name="twitter:description" content="${escapeAttribute(card.description)}">`,
    card.image ? `<meta name="twitter:image" content="${escapeAttribute(card.image)}">` : "",
  ]
    .filter(Boolean)
    .join("");

  return new HTMLRewriter()
    .on('meta[property^="og:"]', {
      element(element) {
        element.remove();
      },
    })
    .on('meta[name^="twitter:"]', {
      element(element) {
        element.remove();
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute("content", card.description);
      },
    })
    .on("title", {
      element(element) {
        element.setInnerContent(card.title);
      },
    })
    .on("head", {
      element(element) {
        element.append(tags, { html: true });
      },
    })
    .transform(response);
}
