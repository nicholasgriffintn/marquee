import { articleTitleFrom, queryWikidata } from "./wikidata-query.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;
const BATCH = 40;
const ENTITY_PATTERN = /^Q\d+$/u;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[a-z]+)?$/u;

export type EntitySitelinks = Map<string, Map<string, string>>;

function siteValues(languages: string[]) {
  return languages
    .filter((language) => LANGUAGE_PATTERN.test(language))
    .map((language) => `<https://${language}.wikipedia.org/>`)
    .join(" ");
}

function languageOf(site: string | undefined) {
  const match = site ? /^https:\/\/([\da-z-]+)\.wikipedia\.org\/$/u.exec(site) : null;

  return match ? match[1] : null;
}

async function queryBatch(entityIds: string[], languages: string[]) {
  const rows = await queryWikidata(
    `SELECT ?item ?site ?article WHERE {
  VALUES ?item { ${entityIds.map((id) => `wd:${id}`).join(" ")} }
  VALUES ?site { ${siteValues(languages)} }
  ?article schema:about ?item ; schema:isPartOf ?site .
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const found: EntitySitelinks = new Map();

  for (const row of rows) {
    const entityId = row.item?.split("/").pop() ?? "";
    const language = languageOf(row.site);
    const article = articleTitleFrom(row.article);

    if (!ENTITY_PATTERN.test(entityId) || !language || !article) {
      continue;
    }

    const sitelinks = found.get(entityId) ?? new Map<string, string>();

    sitelinks.set(language, article);
    found.set(entityId, sitelinks);
  }

  return found;
}

export async function resolveSitelinks(entityIds: string[], languages: string[]) {
  const usable = [...new Set(entityIds)].filter((id) => ENTITY_PATTERN.test(id));
  const found: EntitySitelinks = new Map();

  if (languages.length === 0) {
    return found;
  }

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryBatch(usable.slice(index, index + BATCH), languages);

    for (const [entityId, sitelinks] of wave) {
      found.set(entityId, sitelinks);
    }
  }

  return found;
}
