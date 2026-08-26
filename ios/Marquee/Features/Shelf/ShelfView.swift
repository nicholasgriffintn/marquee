import SwiftUI

struct ShelfView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = ShelfModel()

  var body: some View {
    Group {
      if appState.isSignedIn {
        shelf
      } else {
        ScrollView {
          TicketGate(
            title: "I only keep one shelf per ticket.",
            message:
              "Ratings, notes and progress stay with your account and shape what the Usher puts out."
          )
        }
      }
    }
    .navigationTitle("My shelf")
    .navigationBarTitleDisplayMode(.inline)
    .marqueePage()
  }

  private var shelf: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        MarqueeMasthead(
          eyebrow: "My shelf",
          title: model.shelved == 0
            ? "Nothing put away yet." : "\(model.shelved) titles, in your own hand.",
          copy: "Tap a poster to change its status, rating or note."
        )
        filters

        if model.isLoading && model.items.isEmpty {
          LoadingHouse(label: "Finding your shelf…")
        } else if model.items.isEmpty {
          HouseMessage(
            title: model.error.isEmpty ? "The shelf is empty." : "The shelf is out of reach.",
            message: model.error.isEmpty
              ? "Save something from Tonight or the Listings and it will wait here." : model.error
          )
        } else {
          LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 145), spacing: 14)], alignment: .leading,
            spacing: 24
          ) {
            ForEach(model.items) { ShelfCard(item: $0) }
          }
          if model.hasMore {
            Button("Bring down the next shelf") { Task { await model.loadMore(api: appState.api) } }
              .font(MarqueeTheme.mono(11, weight: .bold))
              .foregroundStyle(MarqueeTheme.ink)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 13)
              .background(MarqueeTheme.acid)
          }
        }
      }
      .padding(18)
      .padding(.bottom, 24)
    }
    .searchable(text: $model.query, prompt: "Search your shelf")
    .task(id: "\(model.filterKey)|\(appState.shelfVersion)") {
      await model.reload(api: appState.api)
    }
    .refreshable { await model.reload(api: appState.api) }
  }

  private var filters: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Menu {
          ForEach(ShelfModel.Sort.allCases) { sort in Button(sort.label) { model.sort = sort } }
        } label: {
          Label(model.sort.label, systemImage: "square.3.layers.3d")
        }
        Spacer()
        Menu {
          Button("Every status") { model.status = nil }
          ForEach(EntryStatus.allCases) { status in Button(status.label) { model.status = status } }
        } label: {
          Label(
            model.status?.label ?? "Every status", systemImage: "line.3.horizontal.decrease.circle")
        }
      }
      .font(MarqueeTheme.mono(10, weight: .bold))

      if model.genres.count > 1 {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            chip("All genres", value: "")
            ForEach(model.genres, id: \.self) { chip($0, value: $0) }
          }
        }
      }
    }
  }

  private func chip(_ label: String, value: String) -> some View {
    Button(label) { model.genre = value }
      .font(MarqueeTheme.mono(9, weight: .bold))
      .foregroundStyle(model.genre == value ? MarqueeTheme.ink : MarqueeTheme.white)
      .padding(.horizontal, 10).padding(.vertical, 7)
      .background(model.genre == value ? MarqueeTheme.acid : MarqueeTheme.panel)
  }
}

private struct ShelfCard: View {
  let item: ShelfItem

  var body: some View {
    NavigationLink {
      TitleDetailView(item: item.title)
    } label: {
      VStack(alignment: .leading, spacing: 7) {
        Artwork(url: item.title.posterUrl, seed: item.title.id, height: 226)
          .overlay(alignment: .bottomLeading) {
            Text(item.entry.status.label.uppercased())
              .font(MarqueeTheme.mono(8, weight: .bold))
              .foregroundStyle(MarqueeTheme.ink)
              .padding(.horizontal, 6).padding(.vertical, 4)
              .background(MarqueeTheme.acid)
              .padding(7)
          }
        Text(item.title.title).font(MarqueeTheme.sans(13, weight: .bold)).lineLimit(2)
        HStack {
          Text(itemMeta(item.title)).lineLimit(1)
          Spacer()
          if let rating = item.entry.rating {
            Text(String(repeating: "★", count: rating)).foregroundStyle(MarqueeTheme.acid)
          }
        }
        .font(MarqueeTheme.mono(8)).foregroundStyle(MarqueeTheme.muted)
      }
    }
    .buttonStyle(.plain)
  }
}
