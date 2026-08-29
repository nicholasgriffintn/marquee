import SwiftUI

struct MarqueePageHeader: View {
  let title: String
  let description: String

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      Text(title)
        .font(MarqueeTheme.display(44))
        .fontWeight(.semibold)
        .tracking(-2.2)
        .fixedSize(horizontal: false, vertical: true)
      Text(description)
        .font(MarqueeTheme.sans(15))
        .foregroundStyle(MarqueeTheme.muted)
        .fixedSize(horizontal: false, vertical: true)
      Rectangle().fill(MarqueeTheme.line).frame(height: 1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct RootNavigationToolbar: ToolbarContent {
  @Binding var query: String
  let onSearch: () -> Void

  var body: some ToolbarContent {
    if #available(iOS 26.0, *) {
      ToolbarItem(placement: .topBarLeading) {
        leadingContent
      }
      .sharedBackgroundVisibility(.hidden)
    } else {
      ToolbarItem(placement: .topBarLeading) {
        leadingContent
      }
    }
    AccountToolbar()
  }

  private var leadingContent: some View {
    HStack(spacing: 10) {
      MarqueeMark()
      HeaderSearchField(query: $query, onSearch: onSearch)
    }
  }
}

private struct MarqueeMark: View {
  var body: some View {
    Image("MarqueeMark")
      .resizable()
      .scaledToFit()
      .frame(width: 34, height: 34)
      .background(MarqueeTheme.acid)
      .clipShape(Rectangle())
      .rotationEffect(.degrees(-2))
      .accessibilityLabel("Marquee")
  }
}

private struct HeaderSearchField: View {
  @Binding var query: String
  let onSearch: () -> Void

  var body: some View {
    HStack(spacing: 7) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(MarqueeTheme.acid)
      TextField("Search", text: $query)
        .font(MarqueeTheme.sans(13))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
        .onSubmit(onSearch)
    }
    .padding(.horizontal, 10)
    .frame(width: 150, height: 34)
    .background(MarqueeTheme.ink)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }
}

struct AccountToolbar: ToolbarContent {
  @EnvironmentObject private var appState: AppState

  var body: some ToolbarContent {
    if appState.isRestoring {
      ToolbarItem(placement: .topBarTrailing) {
        ProgressView().tint(MarqueeTheme.acid)
      }
    } else if let user = appState.user {
      if #available(iOS 26.0, *) {
        ToolbarItem(placement: .topBarTrailing) {
          accountMenu(for: user)
        }
        .sharedBackgroundVisibility(.hidden)
      } else {
        ToolbarItem(placement: .topBarTrailing) {
          accountMenu(for: user)
        }
      }
    } else {
      ToolbarItem(placement: .topBarTrailing) {
        Button("Get a ticket") { appState.requireSignIn() }
          .font(MarqueeTheme.mono(10, weight: .bold))
      }
    }
  }

  private func accountMenu(for user: MarqueeUser) -> some View {
    Menu {
      Text(user.name)
      Button("Sign out", role: .destructive) { Task { await appState.signOut() } }
    } label: {
      avatar(for: user)
    }
    .buttonStyle(.plain)
  }

  private func avatar(for user: MarqueeUser) -> some View {
    AsyncImage(url: user.avatarUrl) { image in
      image.resizable().scaledToFill()
    } placeholder: {
      Text(String(user.name.prefix(1)).uppercased())
        .font(MarqueeTheme.mono(12, weight: .bold))
        .foregroundStyle(.white)
    }
    .frame(width: 32, height: 32)
    .background(MarqueeTheme.blue)
    .clipShape(Rectangle())
  }
}

struct MarqueeSearchField: View {
  let placeholder: String
  @Binding var text: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(MarqueeTheme.acid)
      TextField(placeholder, text: $text)
        .font(MarqueeTheme.sans(14))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 46)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }
}

struct Artwork: View {
  let url: URL?
  let seed: String
  var aspectRatio: CGFloat = 2 / 3
  var height: CGFloat?

  init(url: URL?, seed: String, aspectRatio: CGFloat = 2 / 3, height: CGFloat? = nil) {
    self.url = url
    self.seed = seed
    self.aspectRatio = aspectRatio
    self.height = height
  }

  var body: some View {
    Group {
      if let height {
        GeometryReader { proxy in
          artwork
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        .frame(height: height)
      } else {
        GeometryReader { proxy in
          artwork
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
      }
    }
    .clipped()
    .background(MarqueeTheme.tile)
  }

  private var artwork: some View {
    AsyncImage(
      url: AppConfiguration.resolve(url),
      transaction: Transaction(animation: .easeOut(duration: 0.25))
    ) { phase in
      switch phase {
      case .success(let image): image.resizable().scaledToFill()
      case .failure: placeholder
      default:
        placeholder.overlay { ProgressView().tint(MarqueeTheme.acid) }
      }
    }
  }

  private var placeholder: some View {
    GeometryReader { proxy in
      let flip = abs(seed.hashValue).isMultiple(of: 2)
      ZStack {
        MarqueeTheme.tile
        Circle()
          .stroke(flip ? MarqueeTheme.acid : MarqueeTheme.blue, lineWidth: 8)
          .frame(width: proxy.size.width * 0.72)
          .offset(x: proxy.size.width * 0.18, y: -proxy.size.height * 0.2)
        Rectangle()
          .fill(flip ? MarqueeTheme.blue : MarqueeTheme.coral)
          .frame(width: proxy.size.width * 0.22, height: proxy.size.height * 1.3)
          .rotationEffect(.degrees(24))
      }
    }
  }
}

struct TitleCard: View {
  let item: MediaTitle
  var width: CGFloat = 142
  var rank: Int? = nil

  private let providerLimit = 2

  var body: some View {
    NavigationLink {
      TitleDetailView(item: item)
    } label: {
      VStack(alignment: .leading, spacing: 7) {
        Artwork(url: item.posterUrl, seed: item.id)
          .frame(width: width, height: width * 1.5)
          .overlay(alignment: .topLeading) {
            HStack(spacing: 5) {
              if let rank {
                Text("#\(rank)")
                  .foregroundStyle(MarqueeTheme.ink)
                  .padding(.horizontal, 7)
                  .padding(.vertical, 5)
                  .background(MarqueeTheme.acid)
              }
              Text(item.mediaType == "movie" ? "FILM" : "TV")
                .foregroundStyle(MarqueeTheme.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 5)
                .background(MarqueeTheme.ink.opacity(0.72))
            }
            .font(MarqueeTheme.mono(8, weight: .bold))
            .tracking(0.7)
            .fixedSize()
            .padding(7)
          }
          .overlay(alignment: .bottomTrailing) {
            if !item.providers.isEmpty {
              HStack(spacing: 4) {
                ForEach(item.providers.prefix(providerLimit)) { provider in
                  ProviderBadge(providerID: provider.id, name: provider.name, size: 24)
                }
                if item.providers.count > providerLimit {
                  Text("+\(item.providers.count - providerLimit)")
                    .font(MarqueeTheme.mono(9, weight: .bold))
                    .foregroundStyle(MarqueeTheme.white.opacity(0.8))
                    .padding(.horizontal, 2)
                }
              }
              .padding(.horizontal, 5)
              .padding(.vertical, 4)
              .background(MarqueeTheme.ink.opacity(0.72))
              .padding(.bottom, 7)
              .padding(.trailing, 7)
            }
          }
        Text(item.title)
          .font(MarqueeTheme.sans(13, weight: .bold))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        if let buzz = item.buzz {
          (Text("WIKIPEDIA \(statisticChangeLabel(buzz.delta))")
            .foregroundStyle(MarqueeTheme.blue)
            + Text("  \(compactStatisticCount(buzz.views)) READERS THIS WEEK")
            .foregroundStyle(MarqueeTheme.muted))
            .font(MarqueeTheme.mono(8, weight: .bold))
            .tracking(0.5)
            .textCase(.uppercase)
            .lineLimit(2)
        }
        ratingLine
        Text(itemMeta(item))
          .font(MarqueeTheme.mono(9))
          .foregroundStyle(MarqueeTheme.muted)
          .lineLimit(2)
      }
      .frame(width: width, alignment: .leading)
    }
    .buttonStyle(.plain)
  }

  private var ratingLine: some View {
    let summary = titleRatingSummary(item)

    return
      (Text(summary.sources.uppercased()).foregroundStyle(MarqueeTheme.acid)
      + Text(summary.votes.map { "  \($0.uppercased())" } ?? "")
      .foregroundStyle(MarqueeTheme.muted))
      .font(MarqueeTheme.mono(8, weight: .medium))
      .tracking(0.45)
      .lineLimit(3)
  }
}

struct TitleRail: View {
  @EnvironmentObject private var appState: AppState
  @State private var hasReportedImpression = false
  let section: CatalogSection
  var ranked = false

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      VStack(alignment: .leading, spacing: 3) {
        if !section.description.isEmpty {
          Text(section.description)
            .font(MarqueeTheme.mono(9))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(MarqueeTheme.acid)
            .lineLimit(2)
        }
        Text(section.title)
          .font(MarqueeTheme.display(25))
          .fontWeight(.semibold)
      }
      .padding(.horizontal, 18)
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: 13) {
          ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
            TitleCard(item: item, rank: ranked ? index + 1 : nil)
              .simultaneousGesture(
                TapGesture().onEnded {
                  Telemetry.railClick(section, item: item, position: index, api: appState.api)
                }
              )
          }
        }
        .padding(.horizontal, 18)
      }
    }
    .onAppear {
      guard !hasReportedImpression, !section.items.isEmpty else { return }
      hasReportedImpression = true
      Telemetry.railImpression(section, api: appState.api)
    }
  }
}

struct TitleGrid: View {
  let items: [MediaTitle]
  var ranked = false

  var body: some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 142), spacing: 14)], alignment: .leading, spacing: 24
    ) {
      ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
        TitleCard(item: item, width: 148, rank: ranked ? index + 1 : nil)
      }
    }
  }
}

struct LoadingHouse: View {
  var label = "Setting the programme…"
  var body: some View {
    HStack(spacing: 11) {
      ProgressView().tint(MarqueeTheme.acid)
      Text(label).font(MarqueeTheme.mono(11)).foregroundStyle(MarqueeTheme.muted)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 40)
  }
}

struct HouseMessage: View {
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(MarqueeTheme.display(25)).fontWeight(.semibold)
      Text(message).font(MarqueeTheme.sans(14)).foregroundStyle(MarqueeTheme.muted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }
}

struct TicketGate: View {
  @EnvironmentObject private var appState: AppState
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      AsyncImage(url: AppConfiguration.baseURL.appending(path: "/usher-idle.png")) { image in
        image.resizable().scaledToFit()
      } placeholder: {
        Color.clear
      }
      .frame(height: 170)
      Text("BOX OFFICE").font(MarqueeTheme.mono(10, weight: .bold)).tracking(1.4).foregroundStyle(
        MarqueeTheme.acid)
      Text(title).font(MarqueeTheme.display(31)).fontWeight(.semibold)
      Text(message).font(MarqueeTheme.sans(15)).foregroundStyle(MarqueeTheme.muted)
      Button {
        appState.requireSignIn()
      } label: {
        Label("Get a ticket", systemImage: "ticket")
          .font(MarqueeTheme.mono(12, weight: .bold))
          .foregroundStyle(MarqueeTheme.ink)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 13)
          .background(MarqueeTheme.acid)
      }
      if !appState.authenticationError.isEmpty {
        Text(appState.authenticationError).font(MarqueeTheme.sans(12)).foregroundStyle(
          MarqueeTheme.coral)
      }
    }
    .padding(24)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
    .padding(18)
  }
}

func itemMeta(_ item: MediaTitle) -> String {
  [item.year.map(String.init), item.genres.first, item.certification].compactMap { $0 }.joined(
    separator: " · ")
}

func runtimeLabel(minutes: Int?) -> String {
  guard let minutes else { return "" }
  return minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
}

func mediaMeta(_ item: MediaTitle) -> String {
  let duration: String? =
    if item.mediaType == "movie" {
      item.runtimeMinutes.map { "\($0) min" }
    } else if let seasons = item.numberOfSeasons {
      "\(seasons) season\(seasons == 1 ? "" : "s")"
        + (item.episodeCount.map { ", \($0) episodes" } ?? "")
    } else {
      nil
    }

  return [
    item.year.map(String.init), item.certification, duration,
    item.genres.prefix(2).joined(separator: " / "),
  ]
  .compactMap { value in
    guard let value, !value.isEmpty else { return nil }
    return value
  }
  .joined(separator: " · ")
}

func scoreLabel(_ item: MediaTitle) -> String {
  item.tmdbScore.map { String(format: "%.1f / 10", $0) } ?? "Not yet rated"
}
