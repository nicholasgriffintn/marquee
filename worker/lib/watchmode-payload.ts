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
  logoUrl: string | null;
  regions: string[];
};

function offerLabel(type: string) {
  if (type === "sub") {
    return "Subscription";
  }

  if (type === "free") {
    return "Free";
  }

  if (type === "rent") {
    return "Rent";
  }

  if (type === "buy" || type === "purchase") {
    return "Buy";
  }

  return type === "tve" ? "TV provider" : type;
}

export function watchmodeOfferKind(type: string): ProviderOfferKind {
  if (type === "sub") {
    return "subscription";
  }

  if (type === "free") {
    return "free";
  }

  if (type === "rent") {
    return "rent";
  }

  if (type === "buy" || type === "purchase") {
    return "buy";
  }

  return "other";
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
        logoUrl: httpsUrl(stringAt(source, "logo_100px")),
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
      logoUrl: null,
      offerTypes: [offerType],
      webUrl: httpsUrl(stringAt(source, "web_url")),
      source: "Watchmode",
    });
  }

  return [...providers.values()];
}
