export type FeedEntry = {
  id: string;
  title: string;
  link: string;
  updated: string;
  summary: string;
  category?: string;
};

export type Feed = {
  id: string;
  title: string;
  subtitle: string;
  selfUrl: string;
  siteUrl: string;
  updated: string;
  entries: FeedEntry[];
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function entryElement(entry: FeedEntry) {
  return [
    "  <entry>",
    `    <id>${escapeXml(entry.id)}</id>`,
    `    <title>${escapeXml(entry.title)}</title>`,
    `    <link rel="alternate" type="text/html" href="${escapeXml(entry.link)}"/>`,
    `    <updated>${escapeXml(entry.updated)}</updated>`,
    ...(entry.category ? [`    <category term="${escapeXml(entry.category)}"/>`] : []),
    `    <summary type="text">${escapeXml(entry.summary)}</summary>`,
    "  </entry>",
  ].join("\n");
}

export function buildAtom(feed: Feed) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(feed.id)}</id>`,
    `  <title>${escapeXml(feed.title)}</title>`,
    `  <subtitle>${escapeXml(feed.subtitle)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feed.selfUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(feed.siteUrl)}"/>`,
    `  <updated>${escapeXml(feed.updated)}</updated>`,
    "  <author><name>The Usher</name></author>",
    ...feed.entries.map(entryElement),
    "</feed>",
    "",
  ].join("\n");
}
