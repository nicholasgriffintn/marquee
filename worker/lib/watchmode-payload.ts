import type { ProviderAvailability } from "../../src/domain/catalog.ts";
import {
  findRegistryProviderForOffer,
  type ProviderOfferKind,
} from "../../src/domain/providers.ts";
import { httpsUrl } from "./urls.ts";
import { numberAt, records, stringAt } from "./values.ts";

const PROVIDER_REGION = "GB";

export type WatchmodeSource = {
  id: number;
  name: string;
  type: string;
  regions: string[];
};

const OFFER_LABELS: Record<string, string> = {
  sub: "Subscription",
  free: "Free",
  rent: "Rent",
  buy: "Buy",
  purchase: "Buy",
  tve: "TV provider",
};

const OFFER_KINDS: Record<string, ProviderOfferKind> = {
  sub: "subscription",
  free: "free",
  rent: "rent",
  buy: "buy",
  purchase: "buy",
};

function offerLabel(type: string) {
  return OFFER_LABELS[type] ?? type;
}

export function watchmodeOfferKind(type: string): ProviderOfferKind {
  return OFFER_KINDS[type] ?? "other";
}

export function parseWatchmodeSources(value: unknown) {
  return records(value).flatMap((source): WatchmodeSource[] => {
    const id = numberAt(source, "id");
    const name = stringAt(source, "name");

    if (!id || !name) {
      return [];
    }

    return [
      {
        id,
        name,
        type: stringAt(source, "type") ?? "sub",
        regions: Array.isArray(source.regions)
          ? source.regions.filter((region): region is string => typeof region === "string")
          : [],
      },
    ];
  });
}

export function parseWatchmodeAvailability(value: unknown) {
  const providers = new Map<string, ProviderAvailability>();

  for (const source of records(value)) {
    const sourceId = numberAt(source, "source_id");
    const name = stringAt(source, "name");
    const type = stringAt(source, "type") ?? "sub";
    const region = stringAt(source, "region");

    if (!sourceId || !name || (region && region !== PROVIDER_REGION)) {
      continue;
    }

    const registry = findRegistryProviderForOffer(name, watchmodeOfferKind(type));
    const providerId = registry?.id ?? `watchmode:${sourceId}`;
    const offerType = offerLabel(type);
    const existing = providers.get(providerId);

    if (existing) {
      if (!existing.offerTypes.includes(offerType)) {
        existing.offerTypes.push(offerType);
      }

      existing.webUrl ??= httpsUrl(stringAt(source, "web_url"));
      continue;
    }

    providers.set(providerId, {
      id: providerId,
      name: registry?.name ?? name,
      offerTypes: [offerType],
      webUrl: httpsUrl(stringAt(source, "web_url")),
      source: "Watchmode",
    });
  }

  return [...providers.values()];
}
