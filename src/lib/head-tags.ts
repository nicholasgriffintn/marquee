export type PageMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  canonical: string;
  ogType: string | null;
  structuredData: string[];
  index: boolean;
  appStoreId: string | null;
};

function upsert(selector: string, create: () => HTMLElement) {
  const existing = document.head.querySelector<HTMLElement>(selector);

  if (existing) {
    return existing;
  }

  const created = create();

  document.head.append(created);

  return created;
}

function setMeta(key: "name" | "property", value: string, content: string | null) {
  const selector = `meta[${key}="${CSS.escape(value)}"]`;

  if (content === null) {
    document.head.querySelector(selector)?.remove();

    return;
  }

  const tag = upsert(selector, () => {
    const meta = document.createElement("meta");

    meta.setAttribute(key, value);

    return meta;
  });

  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  const link = upsert('link[rel="canonical"]', () => {
    const created = document.createElement("link");

    created.rel = "canonical";

    return created;
  });

  link.setAttribute("href", href);
}

function setStructuredData(blocks: string[]) {
  for (const script of document.head.querySelectorAll('script[type="application/ld+json"]')) {
    script.remove();
  }

  for (const block of blocks) {
    const script = document.createElement("script");

    script.type = "application/ld+json";
    script.textContent = block;
    document.head.append(script);
  }
}

export function applyPageMetadata(metadata: PageMetadata) {
  if (metadata.title) {
    document.title = metadata.title;
  }

  setMeta("name", "description", metadata.description);
  setMeta("name", "robots", metadata.index ? null : "noindex, follow");
  setMeta("name", "apple-itunes-app", metadata.appStoreId ? `app-id=${metadata.appStoreId}` : null);
  setCanonical(metadata.canonical);

  setMeta("property", "og:type", metadata.ogType);
  setMeta("property", "og:title", metadata.title);
  setMeta("property", "og:description", metadata.description);
  setMeta("property", "og:url", metadata.canonical);
  setMeta("property", "og:image", metadata.image);

  setMeta("name", "twitter:card", metadata.title ? "summary_large_image" : null);
  setMeta("name", "twitter:title", metadata.title);
  setMeta("name", "twitter:description", metadata.description);
  setMeta("name", "twitter:image", metadata.image);

  setStructuredData(metadata.structuredData);
}
