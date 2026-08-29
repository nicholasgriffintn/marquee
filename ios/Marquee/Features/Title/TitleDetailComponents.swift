import SwiftUI

struct TitleDetailHero: View {
  let item: MediaTitle

  var body: some View {
    Artwork(
      url: item.backdropUrl ?? item.posterUrl,
      seed: item.id,
      aspectRatio: 16 / 10,
      height: 300
    )
  }
}

struct TitleOverview: View {
  let item: MediaTitle

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(item.title)
        .font(MarqueeTheme.sans(46, weight: .heavy))
        .tracking(-3.1)
        .lineSpacing(-5)
        .foregroundStyle(MarqueeTheme.ink)
        .fixedSize(horizontal: false, vertical: true)
      Text("\(item.mediaType == "movie" ? "Film" : "TV") · \(mediaMeta(item))")
        .font(MarqueeTheme.mono(10))
        .textCase(.uppercase)
        .foregroundStyle(MarqueeTheme.mutedOnPaper)
        .fixedSize(horizontal: false, vertical: true)
      if item.originalTitle != item.title {
        Text("Original title · \(item.originalTitle)")
          .font(MarqueeTheme.mono(9))
          .textCase(.uppercase)
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
      if !productionLine.isEmpty {
        Text(productionLine)
          .font(MarqueeTheme.mono(9))
          .textCase(.uppercase)
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let tagline = item.tagline, !tagline.isEmpty {
        Text(tagline)
          .font(MarqueeTheme.serif(17))
          .italic()
          .foregroundStyle(MarqueeTheme.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      Text(item.overview.isEmpty ? "No synopsis available." : item.overview)
        .font(MarqueeTheme.sans(17))
        .foregroundStyle(MarqueeTheme.ink)
        .lineSpacing(4)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var productionLine: String {
    [
      item.studios?.prefix(2).joined(separator: " / "),
      item.countries?.prefix(2).joined(separator: " / "),
      item.languages?.prefix(2).joined(separator: " / "),
    ]
    .compactMap { $0 }
    .filter { !$0.isEmpty }
    .joined(separator: " · ")
  }
}

struct TitleWatchOptions: View {
  let item: MediaTitle
  let providers: [ProviderAvailability]
  let selectedProviderIDs: Set<String>
  @Binding var pendingDestination: ExternalDestination?
  @State private var showAll = false
  @State private var showPaid = false

  private var options: WatchOptionGroups {
    watchOptions(
      providers: providers,
      fallbackURL: item.watchLink,
      selectedProviderIDs: selectedProviderIDs
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      TitleDetailSectionLabel("WATCH NOW")

      if options.all.isEmpty {
        Text("No streaming options found.")
          .font(MarqueeTheme.sans(11))
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      } else {
        if let primary = options.primary {
          WatchOptionLink(
            option: primary, titleId: item.id, primary: true,
            pendingDestination: $pendingDestination)
        }

        ForEach(shownStreaming) { option in
          WatchOptionLink(
            option: option, titleId: item.id, pendingDestination: $pendingDestination)
        }

        if !heldStreaming.isEmpty && !showAll {
          Button(
            "Show \(heldStreaming.count) more way\(heldStreaming.count == 1 ? "" : "s") to watch"
          ) {
            showAll = true
          }
          .font(MarqueeTheme.mono(10, weight: .heavy))
          .textCase(.uppercase)
          .foregroundStyle(MarqueeTheme.blue)
        }

        if !options.paid.isEmpty {
          if options.primary != nil {
            Button(
              "Rent or buy from \(options.paid.count) service\(options.paid.count == 1 ? "" : "s")"
            ) {
              showPaid.toggle()
            }
            .font(MarqueeTheme.mono(10, weight: .heavy))
            .textCase(.uppercase)
            .foregroundStyle(MarqueeTheme.blue)
          }

          if showPaid || options.primary == nil {
            ForEach(options.paid) { option in
              WatchOptionLink(
                option: option, titleId: item.id, pendingDestination: $pendingDestination)
            }
          }
        }

        Text(watchCredit)
          .font(MarqueeTheme.mono(10))
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var shownStreaming: [WatchOption] {
    showAll ? options.rest : Array(options.rest.prefix(3))
  }

  private var heldStreaming: [WatchOption] {
    Array(options.rest.dropFirst(3))
  }

  private var watchCredit: String {
    let hasJustWatch = options.all.contains { $0.provider.source != "AniList" }
    let hasAniList = options.all.contains { $0.provider.source == "AniList" }
    return (hasJustWatch ? "Availability from JustWatch. " : "")
      + (hasAniList ? "Streaming sites from AniList. " : "")
      + "It changes without telling me."
  }
}

private struct WatchOptionLink: View {
  let option: WatchOption
  let titleId: String
  var primary = false
  @Binding var pendingDestination: ExternalDestination?

  var body: some View {
    ExternalLinkButton(
      pendingDestination: $pendingDestination,
      destination: ExternalDestination(
        url: option.destination,
        label: option.provider.name,
        kind: .provider,
        titleId: titleId,
        providerId: option.provider.id,
        monetization: option.provider.offerTypes.first
      )
    ) {
      HStack(spacing: 12) {
        ProviderBadge(
          providerID: option.provider.id, name: option.provider.name, size: primary ? 30 : 23)
        VStack(alignment: .leading, spacing: 2) {
          Text(option.label)
            .font(MarqueeTheme.sans(12, weight: .heavy))
            .lineLimit(2)
          if primary {
            Text(option.provider.offerTypes.joined(separator: " · "))
              .font(MarqueeTheme.mono(8))
              .opacity(0.75)
          }
        }
        .layoutPriority(1)
        Spacer()
        Image(systemName: "arrow.up.right")
          .font(.system(size: 11, weight: .bold))
      }
      .foregroundStyle(primary ? MarqueeTheme.white : MarqueeTheme.ink)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(primary ? 12 : 10)
      .background(primary ? MarqueeTheme.blue : Color.clear)
      .overlay {
        if !primary { Rectangle().stroke(MarqueeTheme.paperLine) }
      }
    }
  }
}

struct TitleShelfEditor: View {
  @Binding var entry: ViewingEntry
  let isSaving: Bool
  let hasExistingEntry: Bool
  let message: String
  let onSave: () -> Void
  let onRemove: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      TitleDetailSectionLabel("YOUR SHELF")
      Picker("Status", selection: $entry.status) {
        ForEach(EntryStatus.allCases) { Text($0.label).tag($0) }
      }
      .pickerStyle(.menu)
      HStack {
        Text("Rating").font(MarqueeTheme.sans(13, weight: .bold))
        Spacer()
        ForEach(1...5, id: \.self) { value in
          Button {
            entry.rating = entry.rating == value ? nil : value
          } label: {
            Image(systemName: value <= (entry.rating ?? 0) ? "star.fill" : "star")
          }
        }
      }
      TextEditor(text: $entry.thoughts)
        .font(MarqueeTheme.sans(14))
        .scrollContentBackground(.hidden)
        .frame(minHeight: 96)
        .padding(8)
        .foregroundStyle(MarqueeTheme.ink)
        .background(MarqueeTheme.white)
        .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
      HStack {
        Button(action: onSave) {
          if isSaving {
            ProgressView().tint(MarqueeTheme.ink)
          } else {
            Text("Save to my shelf")
          }
        }
        .font(MarqueeTheme.mono(11, weight: .bold))
        .foregroundStyle(MarqueeTheme.ink)
        .padding(.horizontal, 16).padding(.vertical, 11)
        .background(MarqueeTheme.acid)
        Spacer()
        if hasExistingEntry {
          Button("Remove", role: .destructive, action: onRemove)
            .font(MarqueeTheme.mono(10, weight: .bold))
        }
      }
      if !message.isEmpty {
        Text(message).font(MarqueeTheme.sans(12)).foregroundStyle(
          message.hasPrefix("Saved") ? MarqueeTheme.acid : MarqueeTheme.muted)
      }
    }
    .foregroundStyle(MarqueeTheme.ink)
    .padding(.top, 24)
    .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.paperLine).frame(height: 1) }
  }
}

struct TitleSourceLinks: View {
  let item: MediaTitle
  @Binding var pendingDestination: ExternalDestination?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      TitleDetailSectionLabel("SOURCE LINKS")
      FlowLayout(spacing: 9) {
        ForEach(destinations, id: \.label) { destination in
          ExternalLinkButton(
            pendingDestination: $pendingDestination,
            destination: destination
          ) {
            HStack(spacing: 6) {
              Text(destination.label)
              Image(systemName: "arrow.up.right")
            }
            .font(MarqueeTheme.mono(9, weight: .bold))
            .foregroundStyle(MarqueeTheme.ink)
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var destinations: [ExternalDestination] {
    var destinations: [ExternalDestination] = []
    if let key = item.trailerKey,
      let trailer = URL(string: "https://www.youtube.com/watch?v=\(key)")
    {
      destinations.append(ExternalDestination(url: trailer, label: "Trailer", kind: .trailer))
    }
    destinations.append(ExternalDestination(url: item.tmdbUrl, label: "TMDB", kind: .tmdb))
    if let wikipedia = item.buzz?.articleUrl {
      destinations.append(
        ExternalDestination(url: wikipedia, label: "Wikipedia", kind: .wikipedia))
    }
    if let imdb = item.imdbUrl {
      destinations.append(ExternalDestination(url: imdb, label: "IMDb", kind: .imdb))
    }
    destinations.append(
      contentsOf: titleIdentifierLinks(item.externalIds).map {
        ExternalDestination(url: $0.url, label: $0.label, kind: .other)
      })
    return destinations
  }
}

struct TitleDetailSectionLabel: View {
  let label: String

  init(_ label: String) {
    self.label = label
  }

  var body: some View {
    Text(label)
      .font(MarqueeTheme.mono(9, weight: .bold))
      .tracking(1.35)
      .foregroundStyle(MarqueeTheme.mutedOnPaper)
  }
}
