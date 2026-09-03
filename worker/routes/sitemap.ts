import { Hono } from "hono";

import { NO_ACCESS } from "../../src/domain/access.ts";
import { titleSlug } from "../../src/domain/catalog.ts";
import { barredCertifications } from "../../src/domain/certification.ts";
import { edgeCache, withKvCache } from "../lib/cache.ts";
import { contentNoticeFor, revivalGateFor } from "../lib/revival-notice.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { certificationBar } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";

export const sitemapRoutes = new Hono<{ Bindings: Bindings }>();

const PAGE_SIZE = 10_000;
const CACHE = "public, max-age=3600";
const SITEMAP_CACHE_SECONDS = 86_400;
const sitemapCache = edgeCache(SITEMAP_CACHE_SECONDS);

const STATIC_PATHS = [
  { path: "/", priority: "1.0", changefreq: "hourly" },
  { path: "/listings", priority: "0.9", changefreq: "hourly" },
  { path: "/revival", priority: "0.8", changefreq: "daily" },
  { path: "/trailers", priority: "0.8", changefreq: "hourly" },
  { path: "/directory", priority: "0.5", changefreq: "weekly" },
  { path: "/directory?tab=collections", priority: "0.5", changefreq: "weekly" },
  { path: "/sources", priority: "0.3", changefreq: "monthly" },
  { path: "/privacy", priority: "0.2", changefreq: "yearly" },
  { path: "/terms", priority: "0.2", changefreq: "yearly" },
  { path: "/usher", priority: "0.3", changefreq: "yearly" },
  { path: "/tour", priority: "0.4", changefreq: "monthly" },
];

type TitleRow = {
  media_type: string;
  tmdb_id: number;
  title: string;
  updated_at: string | null;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function lastModified(value: string | null) {
  const parsed = value ? new Date(value.replace(" ", "T")) : null;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function missing() {
  return new Response("No such sitemap.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=UTF-8" },
  });
}

function served(body: string, contentType = "application/xml; charset=UTF-8") {
  return new Response(body, {
    headers: {
      "cache-control": CACHE,
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}

function countTitles(env: Bindings) {
  return withKvCache(env, "sitemap:title-count", SITEMAP_CACHE_SECONDS, async () => {
    const row = await env.DB.first<{ total: number }>(
      "SELECT COUNT(*) AS total FROM catalog_titles",
    );

    return row?.total ?? 0;
  });
}

sitemapRoutes.get("/robots.txt", sitemapCache, (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /notebook",
    "Disallow: /shelf",
    "Disallow: /sign-in",
    "Disallow: /search",
    "Disallow: /api/",
    "Disallow: /feeds/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return served(body, "text/plain; charset=UTF-8");
});

sitemapRoutes.get("/sitemap.xml", sitemapCache, async (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const total = await countTitles(context.env);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entries = [
    `${origin}/sitemap/pages.xml`,
    ...Array.from({ length: pages }, (_, index) => `${origin}/sitemap/titles/${index + 1}.xml`),
  ];

  return served(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map((location) => `<sitemap><loc>${escapeXml(location)}</loc></sitemap>`),
      "</sitemapindex>",
    ].join(""),
  );
});

sitemapRoutes.get("/sitemap/pages.xml", sitemapCache, (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);

  return served(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...STATIC_PATHS.map(
        (entry) =>
          `<url><loc>${escapeXml(`${origin}${entry.path}`)}</loc>` +
          `<changefreq>${entry.changefreq}</changefreq>` +
          `<priority>${entry.priority}</priority></url>`,
      ),
      "</urlset>",
    ].join(""),
  );
});

function urlset(entries: string[]) {
  return served(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      "</urlset>",
    ].join(""),
  );
}

sitemapRoutes.get("/sitemap/people.xml", sitemapCache, async (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const { rows: results } = await context.env.DB.query<{ personId: number }>(
    `SELECT person_id AS "personId" FROM catalog_people WHERE titles > 0 ORDER BY titles DESC LIMIT $1`,
    [PAGE_SIZE],
  );

  return urlset(
    results.map(
      (row) =>
        `<url><loc>${escapeXml(`${origin}/person/${row.personId}`)}</loc>` +
        "<changefreq>weekly</changefreq></url>",
    ),
  );
});

sitemapRoutes.get("/sitemap/collections.xml", sitemapCache, async (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const { rows: results } = await context.env.DB.query<{ id: number }>(
    `SELECT DISTINCT collection_id AS id
       FROM catalog_titles
      WHERE collection_id IS NOT NULL
      LIMIT $1`,
    [PAGE_SIZE],
  );

  return urlset(
    results.map(
      (row) =>
        `<url><loc>${escapeXml(`${origin}/collection/${row.id}`)}</loc>` +
        "<changefreq>monthly</changefreq></url>",
    ),
  );
});

sitemapRoutes.get("/sitemap/revival.xml", sitemapCache, async (context) => {
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const { rows: results } = await context.env.DB.query<{
    id: string;
    title: string;
    synopsis: string;
    contentNotice: string | null;
    certification: string | null;
  }>(
    `SELECT w.id, w.title, w.synopsis, w.content_notice AS "contentNotice", t.certification
       FROM revival_works AS w
       LEFT JOIN catalog_titles AS t ON t.id = w.title_id
      WHERE w.status = 'approved'
      LIMIT $1`,
    [PAGE_SIZE],
  );
  const open = results.filter(
    (row) =>
      revivalGateFor({
        contentNotice: row.contentNotice ?? contentNoticeFor(row.title, row.synopsis),
        certification: row.certification,
      }) === null,
  );

  return urlset(
    open.map(
      (row) =>
        `<url><loc>${escapeXml(`${origin}/revival/${encodeURIComponent(row.id)}`)}</loc>` +
        "<changefreq>monthly</changefreq></url>",
    ),
  );
});

async function renderTitlesPage(env: Bindings, origin: string, page: number) {
  const bindings: DatabaseValue[] = [PAGE_SIZE, (page - 1) * PAGE_SIZE];
  const open = certificationBar("catalog_titles", bindings, barredCertifications(NO_ACCESS));
  const { rows: results } = await env.DB.query<TitleRow>(
    `SELECT media_type, tmdb_id, title, updated_at
       FROM catalog_titles
      WHERE ${open.join(" AND ") || "TRUE"}
      ORDER BY popularity DESC, id
      LIMIT $1 OFFSET $2`,
    bindings,
  );

  if (results.length === 0) {
    return "";
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...results.map((row) => {
      const location = `${origin}/${row.media_type}/${row.tmdb_id}/${titleSlug(row.title)}`;
      const changed = lastModified(row.updated_at);

      return (
        `<url><loc>${escapeXml(location)}</loc>` +
        (changed ? `<lastmod>${changed}</lastmod>` : "") +
        "<changefreq>weekly</changefreq></url>"
      );
    }),
    "</urlset>",
  ].join("");
}

sitemapRoutes.get("/sitemap/titles/:file", sitemapCache, async (context) => {
  const matched = /^([1-9][0-9]*)\.xml$/u.exec(context.req.param("file"));
  const page = matched ? Number(matched[1]) : 0;

  if (!page) {
    return missing();
  }

  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const body = await withKvCache(
    context.env,
    `sitemap:titles:${origin}:${page}`,
    SITEMAP_CACHE_SECONDS,
    () => renderTitlesPage(context.env, origin, page),
  );

  return body ? served(body) : missing();
});
