import type { MediaType } from "../../src/domain/catalog.ts";
import { parseJustwatchAvailability } from "../lib/justwatch-payload.ts";
import { isRecord } from "../lib/values.ts";

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

export class JustwatchError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "JustwatchError";
  }
}

export async function getJustwatchAvailability(
  mediaType: MediaType,
  tmdbId: number,
  searchQuery: string,
) {
  if (!searchQuery.trim()) {
    return null;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
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
    signal: AbortSignal.timeout(12_000),
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
