import SwiftUI

struct DigestView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = DigestModel()

  var body: some View {
    Group {
      if appState.isSignedIn {
        programme
      } else {
        ScrollView {
          TicketGate(
            title: "This programme has your name on it.",
            message:
              "It is printed from your shelf every Monday, so the Usher needs to know whose copy this is."
          )
        }
      }
    }
    .navigationTitle("This week")
    .navigationBarTitleDisplayMode(.inline)
    .marqueePage()
  }

  private var programme: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 28) {
        programmeHeader
        if model.isLoading {
          LoadingHouse()
        } else if let digest = model.digest {
          digestBody(digest)
        } else {
          HouseMessage(
            title: model.error.isEmpty ? "Nothing to print yet." : "The presses stopped.",
            message: model.error.isEmpty
              ? "Save a few things to your shelf. The first programme goes out on Monday."
              : model.error
          )
        }
      }
      .padding(18)
      .padding(.bottom, 30)
    }
    .task { await model.load(api: appState.api) }
    .refreshable { await model.load(api: appState.api) }
  }

  private var programmeHeader: some View {
    VStack(spacing: 7) {
      HStack {
        Text("THE MARQUEE").font(MarqueeTheme.mono(10, weight: .heavy)).tracking(1.6)
        Spacer()
        Text("WEEKLY").font(MarqueeTheme.mono(9)).foregroundStyle(MarqueeTheme.muted)
      }
      Divider().overlay(MarqueeTheme.white)
      Text("This week’s programme")
        .font(MarqueeTheme.display(39)).fontWeight(.semibold)
        .multilineTextAlignment(.center)
      Text("Printed Monday mornings. Nobody asked me to keep doing this.")
        .font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.muted)
        .multilineTextAlignment(.center)
      Divider().overlay(MarqueeTheme.white)
    }
  }

  @ViewBuilder private func digestBody(_ digest: Digest) -> some View {
    if let lead = digest.lead, let item = lead.item {
      NavigationLink {
        TitleDetailView(item: item)
      } label: {
        VStack(alignment: .leading, spacing: 11) {
          Artwork(url: item.backdropUrl ?? item.posterUrl, seed: item.id, aspectRatio: 16 / 9)
          Text("THE PICK OF THE WEEK").font(MarqueeTheme.mono(9, weight: .bold)).foregroundStyle(
            MarqueeTheme.acid)
          Text(item.title).font(MarqueeTheme.display(31)).fontWeight(.semibold)
          Text(lead.line).font(MarqueeTheme.display(19)).italic().foregroundStyle(
            MarqueeTheme.paper)
          ForEach(lead.facts, id: \.self) {
            Text("— \($0)").font(MarqueeTheme.mono(9)).foregroundStyle(MarqueeTheme.muted)
          }
        }
      }
      .buttonStyle(.plain)
    }

    HStack(spacing: 1) {
      number("Added", digest.numbers.added)
      number("Finished", digest.numbers.finished)
      number("On shelf", digest.numbers.shelved)
      number("In house", digest.numbers.catalogue)
    }

    if !digest.fresh.isEmpty {
      TitleRail(
        section: CatalogSection(
          id: "fresh", title: "New, and close to your taste", description: "", items: digest.fresh,
          angle: nil, reason: nil)
      )
      .padding(.horizontal, -18)
    }

    if !digest.episodes.isEmpty {
      VStack(alignment: .leading, spacing: 11) {
        Text("On the schedule").font(MarqueeTheme.display(27)).fontWeight(.semibold)
        ForEach(digest.episodes) { episode in
          HStack(alignment: .firstTextBaseline) {
            Text(formatDate(episode.airsAt)).font(MarqueeTheme.mono(9, weight: .bold))
              .foregroundStyle(MarqueeTheme.acid).frame(width: 72, alignment: .leading)
            Text(episode.showName).font(MarqueeTheme.sans(13, weight: .bold))
            Spacer()
            if let season = episode.season, let number = episode.episode {
              Text("S\(season)E\(number)").font(MarqueeTheme.mono(9)).foregroundStyle(
                MarqueeTheme.muted)
            }
          }
          Divider().overlay(MarqueeTheme.line)
        }
      }
    }

    if !digest.trending.isEmpty {
      TitleRail(
        section: CatalogSection(
          id: "digest-trending", title: "What the town is reading about", description: "",
          items: digest.trending, angle: nil, reason: nil)
      )
      .padding(.horizontal, -18)
    }
  }

  private func number(_ label: String, _ value: Int) -> some View {
    VStack(spacing: 4) {
      Text(value.formatted()).font(MarqueeTheme.display(23)).fontWeight(.semibold)
      Text(label.uppercased()).font(MarqueeTheme.mono(7, weight: .bold)).foregroundStyle(
        MarqueeTheme.muted)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 13)
    .background(MarqueeTheme.panel)
  }

  private func formatDate(_ value: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: value) else { return "Soon" }
    return date.formatted(.dateTime.weekday(.abbreviated).hour().minute())
  }
}
