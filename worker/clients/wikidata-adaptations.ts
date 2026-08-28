import type { MediaType } from "../../src/domain/catalog.ts";
import { slugify } from "../../src/domain/slug.ts";
import { preferredWorkType } from "../lib/source-works.ts";
import { entityIdFrom, literals, queryWikidata, yearFrom } from "./wikidata-query.ts";
import type { EntityRef } from "./wikidata.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;
const LINK_BATCH = 60;
const WORK_BATCH = 60;

const TMDB_PROPERTY: Record<MediaType, string> = { movie: "P4947", tv: "P4983" };

function refKey(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}:${tmdbId}`;
}

function sourceBranch(mediaType: MediaType, tmdbIds: number[]) {
  const variable = mediaType === "movie" ? "movie" : "show";

  return `{
    VALUES ?${variable} { ${literals(tmdbIds)} }
    ?item wdt:${TMDB_PROPERTY[mediaType]} ?${variable} ; wdt:P144 ?work .
    BIND(CONCAT("${mediaType}:", ?${variable}) AS ?key)
  }`;
}

function sourceBranches(refs: EntityRef[]) {
  const byType = new Map<MediaType, number[]>();

  for (const ref of refs) {
    byType.set(ref.mediaType, [...(byType.get(ref.mediaType) ?? []), ref.tmdbId]);
  }

  return [...byType]
    .map(([mediaType, tmdbIds]) => sourceBranch(mediaType, tmdbIds))
    .join("\n  UNION\n  ");
}

export type SourceWorkAuthor = { wikidataId: string; name: string };

export type SourceWorkRecord = {
  workId: string;
  wikidataId: string;
  label: string;
  workType: string | null;
  publishedYear: number | null;
  authors: SourceWorkAuthor[];
};

type WorkDraft = {
  label: string;
  types: Set<string>;
  publishedYear: number | null;
  authors: Map<string, string>;
};

async function linkBatch(refs: EntityRef[]) {
  const rows = await queryWikidata(
    `SELECT ?key ?work WHERE {
  ${sourceBranches(refs)}
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const titleIds = new Map(refs.map((ref) => [refKey(ref.mediaType, ref.tmdbId), ref.titleId]));
  const links = new Map<string, string[]>();

  for (const row of rows) {
    const titleId = titleIds.get(row.key ?? "");
    const work = entityIdFrom(row.work);

    if (!titleId || !work) {
      continue;
    }

    const known = links.get(titleId) ?? [];

    if (!known.includes(work)) {
      links.set(titleId, [...known, work]);
    }
  }

  return links;
}

export async function fetchSourceLinks(refs: EntityRef[]) {
  const usable = [
    ...new Map(
      refs
        .filter((ref) => Number.isInteger(ref.tmdbId) && ref.tmdbId > 0)
        .map((ref) => [ref.titleId, ref]),
    ).values(),
  ];
  const links = new Map<string, string[]>();

  for (let index = 0; index < usable.length; index += LINK_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await linkBatch(usable.slice(index, index + LINK_BATCH));

    for (const [titleId, works] of wave) {
      links.set(titleId, works);
    }
  }

  return links;
}

async function workBatch(entityIds: string[], works: Map<string, WorkDraft>) {
  const rows = await queryWikidata(
    `SELECT ?work ?workLabel ?typeLabel ?author ?authorLabel ?published WHERE {
  VALUES ?work { ${entityIds.map((id) => `wd:${id}`).join(" ")} }
  OPTIONAL { ?work wdt:P31 ?type . }
  OPTIONAL { ?work wdt:P50 ?author . }
  OPTIONAL { ?work wdt:P577 ?published . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  for (const row of rows) {
    const entityId = entityIdFrom(row.work);
    const label = row.workLabel;

    if (!entityId || !label || label === entityId) {
      continue;
    }

    const draft = works.get(entityId) ?? {
      label,
      types: new Set<string>(),
      publishedYear: null,
      authors: new Map<string, string>(),
    };
    const published = yearFrom(row.published);
    const author = entityIdFrom(row.author);

    if (row.typeLabel) {
      draft.types.add(row.typeLabel);
    }

    if (published !== null && (draft.publishedYear === null || published < draft.publishedYear)) {
      draft.publishedYear = published;
    }

    if (author && row.authorLabel && row.authorLabel !== author) {
      draft.authors.set(author, row.authorLabel);
    }

    works.set(entityId, draft);
  }
}

export async function fetchSourceWorks(entityIds: string[]) {
  const unique = [...new Set(entityIds)];
  const drafts = new Map<string, WorkDraft>();

  for (let index = 0; index < unique.length; index += WORK_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    await workBatch(unique.slice(index, index + WORK_BATCH), drafts);
  }

  return new Map(
    [...drafts].map(([entityId, draft]): [string, SourceWorkRecord] => [
      entityId,
      {
        workId: slugify(`${draft.label} ${draft.publishedYear ?? ""}`.trim()),
        wikidataId: entityId,
        label: draft.label,
        workType: preferredWorkType([...draft.types]),
        publishedYear: draft.publishedYear,
        authors: [...draft.authors].map(([id, name]) => ({ wikidataId: id, name })),
      },
    ]),
  );
}
