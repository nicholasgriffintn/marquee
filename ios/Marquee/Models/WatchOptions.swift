import Foundation

enum WatchTier: Int, CaseIterable {
  case yours
  case included
  case free
  case paid
}

struct WatchOption: Identifiable {
  var id: String { provider.id }
  let provider: ProviderAvailability
  let destination: URL
  let tier: WatchTier
  let label: String
}

struct WatchOptionGroups {
  let primary: WatchOption?
  let rest: [WatchOption]
  let paid: [WatchOption]

  var all: [WatchOption] {
    [primary].compactMap { $0 } + rest + paid
  }
}

func watchOptions(
  providers: [ProviderAvailability],
  fallbackURL: URL?,
  selectedProviderIDs: Set<String>
) -> WatchOptionGroups {
  let reachable = providers.compactMap { provider -> (ProviderAvailability, URL, WatchTier)? in
    guard let destination = provider.webUrl ?? fallbackURL else { return nil }
    return (provider, destination, watchTier(provider, selectedProviderIDs: selectedProviderIDs))
  }

  let ordered = WatchTier.allCases.flatMap { tier in
    reachable.filter { $0.2 == tier }
  }
  var streaming: [WatchOption] = []
  var paid: [WatchOption] = []

  for (provider, destination, tier) in ordered {
    let isPaid = tier == .paid
    let isPrimary = !isPaid && streaming.isEmpty
    let option = WatchOption(
      provider: provider,
      destination: destination,
      tier: tier,
      label: watchLabel(provider, isPaid: isPaid, isPrimary: isPrimary)
    )

    if isPaid {
      paid.append(option)
    } else {
      streaming.append(option)
    }
  }

  return WatchOptionGroups(primary: streaming.first, rest: Array(streaming.dropFirst()), paid: paid)
}

private func watchTier(
  _ provider: ProviderAvailability,
  selectedProviderIDs: Set<String>
) -> WatchTier {
  let included = provider.offerTypes.contains("Subscription")
  let free = provider.offerTypes.contains("Free") || provider.offerTypes.contains("Free with ads")

  guard included || free else { return .paid }
  if selectedProviderIDs.contains(provider.id) { return .yours }
  return included ? .included : .free
}

private func watchLabel(
  _ provider: ProviderAvailability,
  isPaid: Bool,
  isPrimary: Bool
) -> String {
  if isPaid {
    return "\(provider.offerTypes.joined(separator: " or ")) from \(provider.name)"
  }
  if isPrimary { return "Watch on \(provider.name)" }
  if !provider.offerTypes.contains("Subscription") {
    return
      "\(provider.offerTypes.contains("Free with ads") ? "Free with ads" : "Free") on \(provider.name)"
  }
  return "Also included on \(provider.name)"
}
