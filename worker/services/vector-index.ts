import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import type { CatalogueSearch } from "../repositories/catalog-search.ts";
import type { Bindings } from "../types.ts";

const BASE_TOP_K = 60;
const MAX_TOP_K = 100;
const RESIDUAL_TOP_K = 20;
const EARLIEST_YEAR = 1900;
const LATEST_YEAR = 2100;

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

export async function queryTitleVectors(
  env: Bindings,
  vector: number[],
  search: CatalogueSearch,
): Promise<VectorizeMatches> {
  const { filter, topK } = vectorSearchPlan(search);
  const options = { topK, returnMetadata: "none" } as const;

  if (!filter) {
    return env.VECTORS.query(vector, options);
  }

  try {
    return await env.VECTORS.query(vector, { ...options, filter });
  } catch (error) {
    logError("vector_metadata_filter_failed", error);

    return env.VECTORS.query(vector, options);
  }
}
