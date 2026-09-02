import type { MediaType, ProviderAvailability } from "../../src/domain/catalog.ts";
import { languageCodes, mergeLanguageCodes } from "../../src/domain/languages.ts";
import {
  canonicalProviderName,
  findRegistryProviderForOffer,
  normaliseProviderName,
  type ProviderOfferKind,
} from "../../src/domain/providers.ts";
import { httpsUrl } from "./urls.ts";
import { isRecord, numberAt, recordAt, records, stringAt } from "./values.ts";

const PHYSICAL_PRESENTATIONS = new Set(["DVD", "BLURAY", "_4K_BLURAY"]);

const OFF_DOMAIN_MONETIZATION = new Set(["CINEMA"]);

const OFFER_LABELS: Record<string, string> = {
  FLATRATE: "Subscription",
  FLATRATE_AND_BUY: "Subscription",
  FREE: "Free",
  ADS: "Free with ads",
  FAST: "Free with ads",
  RENT: "Rent",
  BUY: "Buy",
};

const OFFER_KINDS: Record<string, ProviderOfferKind> = {
  FLATRATE: "subscription",
  FLATRATE_AND_BUY: "subscription",
  FREE: "free",
  ADS: "free",
  FAST: "free",
  RENT: "rent",
  BUY: "buy",
};

const STREAMING_KINDS = new Set<ProviderOfferKind>(["subscription", "free"]);

function offerLabel(monetizationType: string) {
  return OFFER_LABELS[monetizationType] ?? "Other";
}

export function justwatchOfferKind(monetizationType: string): ProviderOfferKind {
  return OFFER_KINDS[monetizationType] ?? "other";
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

  const offers = [...records(match.offers)].toSorted(
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
      OFF_DOMAIN_MONETIZATION.has(monetizationType) ||
      (presentationType && PHYSICAL_PRESENTATIONS.has(presentationType))
    ) {
      continue;
    }

    const offerKind = justwatchOfferKind(monetizationType);
    const registry = findRegistryProviderForOffer(name, offerKind);
    const providerId = registry?.id ?? `justwatch:${packageId}`;
    const label = offerLabel(monetizationType);
    const audioLanguages = STREAMING_KINDS.has(offerKind)
      ? languageCodes(offer.audioLanguages)
      : [];
    const subtitleLanguages = STREAMING_KINDS.has(offerKind)
      ? languageCodes(offer.subtitleLanguages)
      : [];
    const existing = providers.get(providerId);

    if (existing) {
      if (!existing.offerTypes.includes(label)) {
        existing.offerTypes.push(label);
      }

      existing.webUrl ??= offerUrl(offer.standardWebURL);
      const mergedAudioLanguages = mergeLanguageCodes(existing.audioLanguages, audioLanguages);
      const mergedSubtitleLanguages = mergeLanguageCodes(
        existing.subtitleLanguages,
        subtitleLanguages,
      );

      if (mergedAudioLanguages.length > 0) {
        existing.audioLanguages = mergedAudioLanguages;
      }

      if (mergedSubtitleLanguages.length > 0) {
        existing.subtitleLanguages = mergedSubtitleLanguages;
      }

      continue;
    }

    const availability: ProviderAvailability = {
      id: providerId,
      name: registry?.name ?? name,
      offerTypes: [label],
      webUrl: offerUrl(offer.standardWebURL),
      source: "JustWatch",
    };

    if (audioLanguages.length > 0) {
      availability.audioLanguages = audioLanguages;
    }

    if (subtitleLanguages.length > 0) {
      availability.subtitleLanguages = subtitleLanguages;
    }

    providers.set(providerId, availability);
  }

  return [...providers.values()];
}
