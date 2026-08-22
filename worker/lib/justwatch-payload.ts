import type { MediaType, ProviderAvailability } from "../../src/domain/catalog.ts";
import {
  canonicalProviderName,
  findRegistryProviderForOffer,
  normaliseProviderName,
  type ProviderOfferKind,
} from "../../src/domain/providers.ts";
import { httpsUrl } from "./urls.ts";
import { isRecord, numberAt, recordAt, records, stringAt } from "./values.ts";

const PHYSICAL_PRESENTATIONS = new Set(["DVD", "BLURAY", "_4K_BLURAY"]);

function offerLabel(monetizationType: string) {
  if (monetizationType === "FLATRATE" || monetizationType === "FLATRATE_AND_BUY") {
    return "Subscription";
  }

  if (monetizationType === "FREE") {
    return "Free";
  }

  if (monetizationType === "ADS" || monetizationType === "FAST") {
    return "Free with ads";
  }

  if (monetizationType === "RENT") {
    return "Rent";
  }

  if (monetizationType === "BUY") {
    return "Buy";
  }

  return monetizationType === "CINEMA" ? "Cinema" : "Other";
}

export function justwatchOfferKind(monetizationType: string): ProviderOfferKind {
  if (monetizationType === "FLATRATE" || monetizationType === "FLATRATE_AND_BUY") {
    return "subscription";
  }

  if (monetizationType === "FREE" || monetizationType === "ADS" || monetizationType === "FAST") {
    return "free";
  }

  if (monetizationType === "RENT") {
    return "rent";
  }

  return monetizationType === "BUY" ? "buy" : "other";
}

function offerUrl(value: unknown) {
  return typeof value === "string" ? httpsUrl(value.replace(/^http:\/\//u, "https://")) : null;
}

function resellerRank(offer: Record<string, unknown>) {
  const name = stringAt(recordAt(offer, "package") ?? {}, "clearName") ?? "";

  return canonicalProviderName(name) === normaliseProviderName(name) ? 0 : 1;
}

function matchesTitle(node: Record<string, unknown>, mediaType: MediaType, tmdbId: number) {
  const expectedType = mediaType === "movie" ? "MOVIE" : "SHOW";

  if (stringAt(node, "objectType") !== expectedType) {
    return false;
  }

  const externalIds = recordAt(recordAt(node, "content"), "externalIds");

  return externalIds ? stringAt(externalIds, "tmdbId") === String(tmdbId) : false;
}

export function parseJustwatchAvailability(
  value: unknown,
  mediaType: MediaType,
  tmdbId: number,
): ProviderAvailability[] | null {
  const edges = records(recordAt(recordAt(value, "data"), "popularTitles")?.edges);
  const match = edges
    .map((edge) => edge.node)
    .filter(isRecord)
    .find((node) => matchesTitle(node, mediaType, tmdbId));

  if (!match) {
    return null;
  }

  const providers = new Map<string, ProviderAvailability>();

  const offers = [...records(match.offers)].sort(
    (left, right) => resellerRank(left) - resellerRank(right),
  );

  for (const offer of offers) {
    const monetizationType = stringAt(offer, "monetizationType");
    const presentationType = stringAt(offer, "presentationType");
    const distributor = recordAt(offer, "package");
    const packageId = distributor ? numberAt(distributor, "packageId") : null;
    const name = distributor ? stringAt(distributor, "clearName") : null;

    if (
      !monetizationType ||
      !packageId ||
      !name ||
      (presentationType && PHYSICAL_PRESENTATIONS.has(presentationType))
    ) {
      continue;
    }

    const registry = findRegistryProviderForOffer(name, justwatchOfferKind(monetizationType));
    const providerId = registry?.id ?? `justwatch:${packageId}`;
    const label = offerLabel(monetizationType);
    const existing = providers.get(providerId);

    if (existing) {
      if (!existing.offerTypes.includes(label)) {
        existing.offerTypes.push(label);
      }

      existing.webUrl ??= offerUrl(offer.standardWebURL);
      continue;
    }

    providers.set(providerId, {
      id: providerId,
      name: registry?.name ?? name,
      offerTypes: [label],
      webUrl: offerUrl(offer.standardWebURL),
      source: "JustWatch",
    });
  }

  return [...providers.values()];
}
