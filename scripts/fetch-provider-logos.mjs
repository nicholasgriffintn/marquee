// Vendors each service's own icon into public/providers so the app never renders brand art from
// an aggregator CDN. Sources live in scripts/provider-logo-sources.json.
//
//   node scripts/fetch-provider-logos.mjs [provider-id ...]
//
// Icons are validated by magic bytes (an HTML error page served as .png is common), rejected
// below 32px, converted to PNG with sips and capped at 128px. SVGs are kept as vectors.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public", "providers");
const SOURCES = JSON.parse(
  fs.readFileSync(path.join(root, "scripts", "provider-logo-sources.json"), "utf8"),
);
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const MIN_PIXELS = 32;
const MAX_PIXELS = 128;
const MAX_SVG_BYTES = 120_000;

function imageKind(buffer) {
  if (buffer.length < 16) {
    return null;
  }

  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return "png";
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "jpg";
  }

  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") {
    return "webp";
  }

  if (buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) {
    return "ico";
  }

  const head = buffer.subarray(0, 1000).toString("utf8").toLowerCase();

  if (head.includes("<!doctype html") || head.includes("<html")) {
    return null;
  }

  return head.includes("<svg") ? "svg" : null;
}

function pixels(file) {
  try {
    const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], {
      encoding: "utf8",
    });
    const sizes = [...output.matchAll(/pixel(?:Width|Height):\s*(\d+)/gu)].map((m) => Number(m[1]));

    return sizes.length === 2 ? sizes : [0, 0];
  } catch {
    return [0, 0];
  }
}

async function download(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "image/*,text/html;q=0.8,*/*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return { buffer: Buffer.from(await response.arrayBuffer()), url: response.url };
}

// Site-declared icons first, largest wins; Safari mask icons are monochrome silhouettes that read
// as a black square on a dark page, so they rank last.
function declaredIcons(html, baseUrl) {
  const icons = [];

  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const rel = /rel=["']([^"']+)["']/iu.exec(tag)?.[1]?.toLowerCase() ?? "";

    if (!rel.includes("icon")) {
      continue;
    }

    const href = /href=["']([^"']+)["']/iu.exec(tag)?.[1];

    if (!href) {
      continue;
    }

    const declared = /sizes=["'](\d+)x\d+["']/iu.exec(tag)?.[1];
    const inline = /[^0-9](\d{2,4})x\1/u.exec(href);
    const isMask = rel.includes("mask") || /safari-pinned-tab/iu.test(href);
    let rank = declared
      ? Number(declared)
      : href.toLowerCase().endsWith(".svg")
        ? 400
        : rel.includes("apple")
          ? 180
          : 32;

    if (inline) {
      rank = Math.max(rank, Number(inline[1]));
    }

    if (isMask) {
      rank = 1;
    }

    try {
      icons.push({ url: new URL(href.replaceAll("&amp;", "&"), baseUrl).href, rank });
    } catch {
      continue;
    }
  }

  return icons.toSorted((left, right) => right.rank - left.rank).map((icon) => icon.url);
}

function store(id, buffer, kind) {
  if (kind === "svg") {
    if (buffer.length > MAX_SVG_BYTES) {
      throw new Error("svg too heavy");
    }

    const svg = buffer
      .toString("utf8")
      .replace(/<script[\s\S]*?<\/script>/giu, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/giu, "")
      .trim();

    fs.writeFileSync(path.join(OUT, `${id}.svg`), `${svg}\n`);

    return "vector";
  }

  const scratch = path.join(OUT, `${id}.download`);
  const target = path.join(OUT, `${id}.png`);

  fs.writeFileSync(scratch, buffer);

  try {
    execFileSync("sips", ["-s", "format", "png", scratch, "--out", target], { stdio: "ignore" });
  } finally {
    fs.unlinkSync(scratch);
  }

  const [width, height] = pixels(target);

  if (Math.min(width, height) < MIN_PIXELS) {
    fs.unlinkSync(target);
    throw new Error(`${width}x${height} too small`);
  }

  if (Math.max(width, height) > MAX_PIXELS) {
    execFileSync("sips", ["--resampleHeightWidthMax", String(MAX_PIXELS), target], {
      stdio: "ignore",
    });
  }

  return pixels(target).join("x");
}

async function fetchLogo(id, homepage) {
  const { origin, hostname } = new URL(homepage);
  const bare = hostname.replace(/^www\./u, "");
  const attempts = [];

  try {
    attempts.push(
      ...declaredIcons((await download(homepage)).buffer.toString("utf8"), homepage).slice(0, 6),
    );
  } catch {
    // A homepage that refuses the request still has the conventional icon paths below.
  }

  attempts.push(
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `https://icons.duckduckgo.com/ip3/${bare}.ico`,
    `https://www.google.com/s2/favicons?sz=256&domain=${bare}`,
    `${origin}/favicon.svg`,
    `${origin}/favicon.ico`,
  );

  for (const attempt of new Set(attempts)) {
    try {
      // Candidates are ordered best-first, so stop at the first one that yields a real image.
      // oxlint-disable-next-line no-await-in-loop
      const { buffer } = await download(attempt);
      const kind = imageKind(buffer);

      if (!kind) {
        continue;
      }

      return { size: store(id, buffer, kind), url: attempt };
    } catch {
      continue;
    }
  }

  return null;
}

const wanted = process.argv.slice(2);
const entries = Object.entries(SOURCES).filter(([id]) => !wanted.length || wanted.includes(id));

fs.mkdirSync(OUT, { recursive: true });

let missing = 0;

for (const [id, homepage] of entries) {
  // Sites rate-limit, and this runs by hand a few times a year, so keep it sequential.
  // oxlint-disable-next-line no-await-in-loop
  const result = await fetchLogo(id, homepage).catch(() => null);

  if (!result) {
    missing += 1;
  }

  console.log(`${result ? "ok  " : "miss"} ${id.padEnd(26)} ${result ? result.size : homepage}`);
}

console.log(`\n${entries.length - missing}/${entries.length} logos in public/providers`);
