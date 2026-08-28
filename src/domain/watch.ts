import { sentenceList } from "../lib/string";
import type { ProviderAvailability } from "./catalog";

export const STREAMING_LIMIT = 4;

const INCLUDED_OFFER = "Subscription";
const FREE_OFFERS = new Set(["Free", "Free with ads"]);
const PAID_OFFERS = new Set(["Rent", "Buy"]);

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

function providerNames(providers: ProviderAvailability[]) {
  return sentenceList([...new Set(providers.map((provider) => provider.name))]);
}

export function availabilityLine(title: string, providers: ProviderAvailability[]) {
  const included = providers.filter((provider) => provider.offerTypes.includes(INCLUDED_OFFER));
  const free = providers.filter(
    (provider) =>
      !provider.offerTypes.includes(INCLUDED_OFFER) &&
      provider.offerTypes.some((offer) => FREE_OFFERS.has(offer)),
  );
  const paid = providers.filter((provider) =>
    provider.offerTypes.some((offer) => PAID_OFFERS.has(offer)),
  );
  const clauses: string[] = [];

  if (included.length > 0) {
    clauses.push(`stream ${title} on ${providerNames(included)}`);
  }

  if (free.length > 0) {
    const withAds = free.some((provider) => provider.offerTypes.includes("Free with ads"));
    const subject = clauses.length > 0 ? "it" : title;

    clauses.push(
      `watch ${subject} free ${withAds ? "with adverts " : ""}on ${providerNames(free)}`,
    );
  }

  const opening = clauses.length > 0 ? `Right now you can ${clauses.join(", or ")}.` : "";

  if (paid.length === 0) {
    return opening;
  }

  const rentable = paid.some((provider) => provider.offerTypes.includes("Rent"));
  const buyable = paid.some((provider) => provider.offerTypes.includes("Buy"));
  const verb = rentable && buyable ? "rent or buy" : rentable ? "rent" : "buy";
  const closing = opening
    ? `You can also ${verb} it from ${providerNames(paid)}.`
    : `Right now you can ${verb} ${title} from ${providerNames(paid)}.`;

  return opening ? `${opening} ${closing}` : closing;
}
