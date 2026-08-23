import type { MediaType } from "../../src/domain/catalog.ts";
import { parseJustwatchAvailability } from "../lib/justwatch-payload.ts";
import { isRecord } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;

const API_URL = "https://apis.justwatch.com/graphql";
const COUNTRY = "GB";
const LANGUAGE = "en";
const SEARCH_RESULTS = 10;

const AVAILABILITY_QUERY = `query MarqueeTitleOffers($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter, $platform: Platform!) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        objectType
        content(country: $country, language: $language) {
          externalIds {
            tmdbId
          }
        }
        offers(country: $country, platform: $platform) {
          monetizationType
          presentationType
          standardWebURL
          package {
            packageId
            clearName
          }
        }
      }
    }
  }
}`;

export const JustwatchError = upstreamError("JustwatchError");

export async function getJustwatchAvailability(
  mediaType: MediaType,
  tmdbId: number,
  searchQuery: string,
) {
  if (!searchQuery.trim()) {
    return null;
  }

  const response = await upstreamFetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutMs: TIMEOUT_MS,
    body: JSON.stringify({
      operationName: "MarqueeTitleOffers",
      query: AVAILABILITY_QUERY,
      variables: {
        country: COUNTRY,
        language: LANGUAGE,
        first: SEARCH_RESULTS,
        platform: "WEB",
        filter: {
          searchQuery,
          objectTypes: [mediaType === "movie" ? "MOVIE" : "SHOW"],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new JustwatchError(
      `JustWatch request failed (${response.status})`,
      response.status === 429 ? 429 : 502,
    );
  }

  const payload = await response.json();

  if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new JustwatchError("JustWatch rejected the availability query");
  }

  return parseJustwatchAvailability(payload, mediaType, tmdbId);
}
