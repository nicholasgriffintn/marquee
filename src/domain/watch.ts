import type { ProviderAvailability } from "./catalog";

export const STREAMING_LIMIT = 4;

const INCLUDED_OFFER = "Subscription";
const FREE_OFFERS = new Set(["Free", "Free with ads"]);

export type WatchTier = "yours" | "included" | "free" | "paid";

export type WatchOption = {
  provider: ProviderAvailability;
  href: string;
  tier: WatchTier;
  label: string;
};

const TIER_ORDER: WatchTier[] = ["yours", "included", "free", "paid"];

function tierFor(provider: ProviderAvailability, mine: ReadonlySet<string>): WatchTier {
  const included = provider.offerTypes.includes(INCLUDED_OFFER);
  const free = provider.offerTypes.some((offer) => FREE_OFFERS.has(offer));

  if (!included && !free) {
    return "paid";
  }

  return mine.has(provider.id) ? "yours" : included ? "included" : "free";
}

function labelFor(provider: ProviderAvailability, isPaid: boolean, isPrimary: boolean) {
  if (isPaid) {
    return `${provider.offerTypes.join(" or ")} from ${provider.name}`;
  }

  if (isPrimary) {
    return `Watch on ${provider.name}`;
  }

  if (!provider.offerTypes.includes(INCLUDED_OFFER)) {
    const ads = provider.offerTypes.includes("Free with ads");

    return `${ads ? "Free with ads" : "Free"} on ${provider.name}`;
  }

  return `Also included on ${provider.name}`;
}

export function watchOptions(
  providers: ProviderAvailability[],
  fallbackHref: string | null,
  selectedProviderIds: string[],
) {
  const mine = new Set(selectedProviderIds);
  const reachable = providers.flatMap((provider) => {
    const href = provider.webUrl ?? fallbackHref;

    return href ? [{ provider, href, tier: tierFor(provider, mine) }] : [];
  });

  const ordered = TIER_ORDER.flatMap((tier) => reachable.filter((option) => option.tier === tier));
  const streaming: WatchOption[] = [];
  const paid: WatchOption[] = [];

  for (const option of ordered) {
    const isPaid = option.tier === "paid";
    const bucket = isPaid ? paid : streaming;

    bucket.push(
      Object.assign(option, {
        label: labelFor(option.provider, isPaid, !isPaid && streaming.length === 0),
      }),
    );
  }

  return { primary: streaming[0] ?? null, rest: streaming.slice(1), paid };
}
