import { tagSlug, type RevivalTag, type RevivalTagKind } from "../../src/domain/revival.ts";

const MAX_PER_KIND = 12;
const MAX_LABEL = 80;
const MIN_LABEL = 2;

const NOISE = new Set([
  "film",
  "films",
  "video",
  "movies",
  "moving image",
  "motion pictures (visual works)",
  "motion picture",
  "unknown",
  "n/a",
  "none",
  "other",
  "crown",
  "germany",
  "sweden",
  "france",
  "italy",
  "spain",
  "netherlands",
  "belgium",
  "denmark",
  "ireland",
  "united kingdom",
  "united states",
  "europe",
  "cellulose nitrate film",
  "film",
  "nitrate",
  "safety film",
  "corona",
  "exterior",
  "interior",
  "need keyword",
  "keywords",
  "untitled",
  "misc",
]);

const ADULT =
  /\b(stripper|strippers|stag|burlesque|nude|nudist|erotic|erotica|porn|xxx|adult film)\b/iu;

const QUALIFIER = /\s*\([^)]*\)\s*$/u;

const SYNONYMS = new Map([
  ["world war i", "The First World War"],
  ["world war one", "The First World War"],
  ["wwi", "The First World War"],
  ["ww1", "The First World War"],
  ["first world war", "The First World War"],
  ["world war 1914 1918", "The First World War"],
  ["world war ii", "The Second World War"],
  ["world war two", "The Second World War"],
  ["wwii", "The Second World War"],
  ["ww2", "The Second World War"],
  ["second world war", "The Second World War"],
  ["world war 1939 1945", "The Second World War"],
  ["documentary films", "Documentary film"],
  ["nonfiction films", "Nonfiction film"],
  ["short films", "Short film"],
  ["short subjects", "Short film"],
  ["silent films", "Silent film"],
  ["fiction films", "Fiction film"],
  ["educational films", "Educational film"],
  ["newsreels", "Newsreel"],
]);

const URI = /^(https?:|urn:|www\.)/iu;
const GAUGE = /\b\d{1,3}\s?mm\b|photographic film size/iu;
const CODE = /^[a-z]{0,4}\d{3,}$/iu;
const LATIN = /[a-z]/iu;

const ROLE =
  /,\s*(director|screenwriter|cinematographer|film editor|composer|actor|actress|production company|film distributor|associated name|narrator|producer)\b.*$/iu;
const LIFESPAN = /,?\s*\d{4}\s*-\s*\d{0,4}\.?\s*$/u;

export function personName(raw: string) {
  const cleaned = raw.replace(ROLE, "").replace(LIFESPAN, "").trim().replace(/[.,]$/u, "");

  if (!cleaned.includes(",")) {
    return cleaned;
  }

  const [family, given] = cleaned.split(",", 2);

  return `${given.trim()} ${family.trim()}`.trim();
}

export function canonicalLabel(raw: string) {
  const trimmed = raw.trim().replace(QUALIFIER, "").replace(/\s+/gu, " ").slice(0, MAX_LABEL);
  const mapped = SYNONYMS.get(tagSlug(trimmed).replaceAll("-", " "));

  if (mapped) {
    return mapped;
  }

  return trimmed && trimmed === trimmed.toLowerCase()
    ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    : trimmed;
}

export function tagList(kind: RevivalTagKind, values: readonly (string | null | undefined)[]) {
  const seen = new Map<string, RevivalTag>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const label = canonicalLabel(value);

    if (
      label.length < MIN_LABEL ||
      NOISE.has(label.toLowerCase()) ||
      URI.test(label) ||
      ADULT.test(label) ||
      GAUGE.test(label) ||
      CODE.test(label) ||
      !LATIN.test(label)
    ) {
      continue;
    }

    const slug = tagSlug(label);

    if (slug && !seen.has(slug)) {
      seen.set(slug, { kind, slug, label });
    }
  }

  return [...seen.values()].slice(0, MAX_PER_KIND);
}

export function splitSubjects(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/[;|]/u).flatMap((part) => part.split(",").map((entry) => entry.trim()));
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => (typeof entry === "string" ? splitSubjects(entry) : []));
}
