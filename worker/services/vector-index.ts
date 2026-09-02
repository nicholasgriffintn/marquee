import type { MediaTitle } from "../../src/domain/catalog.ts";
import { withDeadline } from "../lib/deadline.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import type { CatalogueSearch } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";

const BASE_TOP_K = 60;
const MAX_TOP_K = 100;
const RESIDUAL_TOP_K = 20;
const EARLIEST_YEAR = 1900;
const LATEST_YEAR = 2100;

export const WIDE_TOP_K = 200;
export const VECTOR_QUERY_TIMEOUT_MS = 800;

let metadataFilterUsable = true;

export type TitleVectorMatches = { matches: VectorizeMatch[]; filtered: boolean };

export type VectorQueryOptions = { topK?: number; skipFilter?: boolean };

export function titleVectorMetadata(title: MediaTitle) {
  return {
    mediaType: title.mediaType,
    year: title.year ?? 0,
    popularity: Math.round(title.popularity),
  };
}

function metadataFilter(search: CatalogueSearch) {
  const filter: VectorizeVectorMetadataFilter = {};

  if (search.mediaType === "movie" || search.mediaType === "tv") {
    filter.mediaType = { $eq: search.mediaType };
  }

  if (Number.isFinite(search.releasedAfter)) {
    filter.year = {
      $gte: clamp(Math.trunc(search.releasedAfter ?? 0), EARLIEST_YEAR, LATEST_YEAR),
    };
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

function unindexedConstraints(search: CatalogueSearch) {
  return [
    search.genres?.length,
    search.keywords?.length,
    search.places?.length,
    search.providerIds?.length,
    search.excludeIds?.length,
    search.certifications?.length,
    search.languages?.length,
    Number.isFinite(search.minScore),
    Number.isFinite(search.minVotes),
    Number.isFinite(search.maxRuntime),
  ].filter(Boolean).length;
}

export function vectorSearchPlan(search: CatalogueSearch) {
  return {
    filter: metadataFilter(search),
    topK: clamp(BASE_TOP_K + unindexedConstraints(search) * RESIDUAL_TOP_K, BASE_TOP_K, MAX_TOP_K),
  };
}

export const NO_MATCHES: VectorizeMatches = { matches: [], count: 0 };

async function runQuery(env: Bindings, vector: number[], options: VectorizeQueryOptions) {
  const result = await withDeadline(
    env.VECTORS.query(vector, options),
    VECTOR_QUERY_TIMEOUT_MS,
    NO_MATCHES,
  );

  return result.matches;
}

export async function queryTitleVectors(
  env: Bindings,
  vector: number[],
  search: CatalogueSearch,
  options: VectorQueryOptions = {},
): Promise<TitleVectorMatches> {
  const plan = vectorSearchPlan(search);
  const filter = options.skipFilter === true || !metadataFilterUsable ? null : plan.filter;
  const query: VectorizeQueryOptions = {
    topK: options.topK ?? plan.topK,
    returnMetadata: "none",
  };

  if (!filter) {
    return { matches: await runQuery(env, vector, query), filtered: false };
  }

  try {
    return { matches: await runQuery(env, vector, { ...query, filter }), filtered: true };
  } catch (error) {
    metadataFilterUsable = false;
    logError("vector_metadata_filter_failed", error);

    return { matches: await runQuery(env, vector, query), filtered: false };
  }
}
