import SwiftUI

struct TitleDetailHero: View {
  let item: MediaTitle

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      Artwork(
        url: item.backdropUrl ?? item.posterUrl,
        seed: item.id,
        aspectRatio: 16 / 10,
        height: 410
      )
      LinearGradient(
        stops: [
          .init(color: MarqueeTheme.ink.opacity(0.02), location: 0.25),
          .init(color: MarqueeTheme.ink.opacity(0.4), location: 0.58),
          .init(color: MarqueeTheme.ink, location: 1),
        ],
        startPoint: .top,
        endPoint: .bottom
      )
      VStack(alignment: .leading, spacing: 9) {
        Text(item.mediaType == "movie" ? "FEATURE" : "SERIES")
          .font(MarqueeTheme.mono(9, weight: .bold))
          .tracking(1.2)
          .foregroundStyle(MarqueeTheme.ink)
          .padding(.horizontal, 8)
          .padding(.vertical, 5)
          .background(MarqueeTheme.acid)
        Text(item.title)
          .font(MarqueeTheme.display(42))
          .fontWeight(.semibold)
          .lineLimit(3)
          .fixedSize(horizontal: false, vertical: true)
        Text(
          [itemMeta(item), runtimeLabel(minutes: item.runtimeMinutes)].filter { !$0.isEmpty }
            .joined(separator: " · ")
        )
        .font(MarqueeTheme.mono(10, weight: .medium))
        .foregroundStyle(MarqueeTheme.paper.opacity(0.76))
        .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 20)
      .padding(.bottom, 22)
    }
    .frame(maxWidth: .infinity)
    .clipped()
  }
}

struct TitleOverview: View {
  let item: MediaTitle

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      TitleDetailSectionLabel("THE PICTURE")
      if let tagline = item.tagline, !tagline.isEmpty {
        Text(tagline)
          .font(MarqueeTheme.display(25))
          .italic()
          .foregroundStyle(MarqueeTheme.acid)
          .fixedSize(horizontal: false, vertical: true)
      }
      Text(item.overview.isEmpty ? "No synopsis is on the programme yet." : item.overview)
        .font(MarqueeTheme.sans(16))
        .foregroundStyle(MarqueeTheme.paper)
        .lineSpacing(4)
        .fixedSize(horizontal: false, vertical: true)
      if !item.genres.isEmpty {
        Text(item.genres.joined(separator: "  ·  "))
          .font(MarqueeTheme.mono(9, weight: .medium))
          .foregroundStyle(MarqueeTheme.muted)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct TitleWatchOptions: View {
  let item: MediaTitle

  var body: some View {
    if !item.providers.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        TitleDetailSectionLabel("WHERE TO WATCH")
        ForEach(item.providers) { provider in
          if let url = provider.webUrl ?? item.watchLink {
            providerLink(provider, destination: url)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func providerLink(_ provider: ProviderAvailability, destination: URL) -> some View {
    Link(destination: destination) {
      HStack(spacing: 13) {
        Text(String(provider.name.prefix(1)).uppercased())
          .font(MarqueeTheme.display(20))
          .foregroundStyle(MarqueeTheme.ink)
          .frame(width: 38, height: 38)
          .background(MarqueeTheme.acid)
        VStack(alignment: .leading, spacing: 3) {
          Text(provider.name)
            .font(MarqueeTheme.sans(14, weight: .bold))
            .foregroundStyle(MarqueeTheme.white)
            .lineLimit(1)
          if !provider.offerTypes.isEmpty {
            Text(provider.offerTypes.joined(separator: " · ").uppercased())
              .font(MarqueeTheme.mono(8, weight: .medium))
              .tracking(0.5)
              .foregroundStyle(MarqueeTheme.muted)
              .lineLimit(2)
          }
        }
        .layoutPriority(1)
        Spacer()
        Image(systemName: "arrow.up.right")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(MarqueeTheme.acid)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(13)
      .background(MarqueeTheme.panel)
      .overlay { Rectangle().stroke(MarqueeTheme.line) }
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
        .background(MarqueeTheme.ink)
        .overlay { Rectangle().stroke(MarqueeTheme.line) }
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
    .padding(16)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }
}

struct TitleSourceLinks: View {
  let item: MediaTitle

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      TitleDetailSectionLabel("ELSEWHERE")
      HStack(spacing: 9) {
        ForEach(destinations, id: \.label) { destination in
          Link(destination: destination.url) {
            HStack(spacing: 6) {
              Text(destination.label)
              Image(systemName: "arrow.up.right")
            }
            .font(MarqueeTheme.mono(9, weight: .bold))
            .foregroundStyle(MarqueeTheme.paper)
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .overlay { Rectangle().stroke(MarqueeTheme.line) }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var destinations: [(label: String, url: URL)] {
    var destinations = [(label: "TMDB", url: item.tmdbUrl)]
    if let imdb = item.imdbUrl { destinations.append((label: "IMDb", url: imdb)) }
    if let key = item.trailerKey,
      let trailer = URL(string: "https://www.youtube.com/watch?v=\(key)")
    {
      destinations.append((label: "Trailer", url: trailer))
    }
    return destinations
  }
}

private struct TitleDetailSectionLabel: View {
  let label: String

  init(_ label: String) {
    self.label = label
  }

  var body: some View {
    Text(label)
      .font(MarqueeTheme.mono(9, weight: .bold))
      .tracking(1.35)
      .foregroundStyle(MarqueeTheme.acid)
  }
}
