import SwiftUI

struct MarqueeMasthead: View {
  let eyebrow: String
  let title: String
  var copy: String = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(spacing: 10) {
        Text("M")
          .font(MarqueeTheme.sans(17, weight: .heavy))
          .foregroundStyle(MarqueeTheme.ink)
          .frame(width: 36, height: 36)
          .background(MarqueeTheme.acid)
          .rotationEffect(.degrees(-2))
        Text(eyebrow.uppercased())
          .font(MarqueeTheme.mono(11, weight: .bold))
          .tracking(1.2)
          .foregroundStyle(MarqueeTheme.muted)
      }
      Text(title)
        .font(MarqueeTheme.display(38))
        .fontWeight(.semibold)
        .fixedSize(horizontal: false, vertical: true)
      if !copy.isEmpty {
        Text(copy)
          .font(MarqueeTheme.sans(15))
          .foregroundStyle(MarqueeTheme.muted)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct AccountToolbar: ToolbarContent {
  @EnvironmentObject private var appState: AppState

  var body: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      if appState.isRestoring {
        ProgressView().tint(MarqueeTheme.acid)
      } else if let user = appState.user {
        Menu {
          Text(user.name)
          Button("Sign out", role: .destructive) { Task { await appState.signOut() } }
        } label: {
          avatar(for: user)
        }
      } else {
        Button("Get a ticket") { Task { await appState.signIn() } }
          .font(MarqueeTheme.mono(10, weight: .bold))
      }
    }
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
        artwork
          .aspectRatio(aspectRatio, contentMode: .fill)
          .frame(maxWidth: .infinity)
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

  var body: some View {
    NavigationLink {
      TitleDetailView(item: item)
    } label: {
      VStack(alignment: .leading, spacing: 7) {
        Artwork(url: item.posterUrl, seed: item.id)
          .frame(width: width, height: width * 1.5)
          .overlay(alignment: .topLeading) {
            if let score = item.tmdbScore {
              Text(String(format: "%.1f", score))
                .font(MarqueeTheme.mono(9, weight: .bold))
                .foregroundStyle(MarqueeTheme.ink)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(MarqueeTheme.acid)
                .padding(7)
            }
          }
        Text(item.title)
          .font(MarqueeTheme.sans(13, weight: .bold))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        Text(itemMeta(item))
          .font(MarqueeTheme.mono(9))
          .foregroundStyle(MarqueeTheme.muted)
          .lineLimit(1)
      }
      .frame(width: width, alignment: .leading)
    }
    .buttonStyle(.plain)
  }
}

struct TitleRail: View {
  let section: CatalogSection

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
          ForEach(section.items) { TitleCard(item: $0) }
        }
        .padding(.horizontal, 18)
      }
    }
  }
}

struct TitleGrid: View {
  let items: [MediaTitle]

  var body: some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 142), spacing: 14)], alignment: .leading, spacing: 24
    ) {
      ForEach(items) { item in
        TitleCard(item: item, width: 148)
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
        Task { await appState.signIn() }
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
