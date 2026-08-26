import SwiftUI

struct ListingsView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = ListingsModel()

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        MarqueeMasthead(
          eyebrow: "The listings",
          title: "Everything in the building.",
          copy: "Narrow it down and I will get out of your way."
        )
        filters

        if model.items.isEmpty, model.isLoading {
          LoadingHouse(label: "Reading the board…")
        } else if model.items.isEmpty {
          HouseMessage(
            title: model.error.isEmpty ? "Nothing under that name." : "The listings are stuck.",
            message: model.error.isEmpty ? "Try a title, a plot, or a wider filter." : model.error
          )
        } else {
          Text("\(model.items.count) titles")
            .font(MarqueeTheme.mono(10, weight: .bold))
            .foregroundStyle(MarqueeTheme.muted)
          TitleGrid(items: model.items)
          if model.hasMore {
            Button {
              Task { await loadMore() }
            } label: {
              HStack {
                Spacer()
                if model.isLoading {
                  ProgressView().tint(MarqueeTheme.ink)
                } else {
                  Text("More from the listings")
                }
                Spacer()
              }
              .font(MarqueeTheme.mono(11, weight: .bold))
              .foregroundStyle(MarqueeTheme.ink)
              .padding(.vertical, 13)
              .background(MarqueeTheme.acid)
            }
            .disabled(model.isLoading)
          }
        }
      }
      .padding(18)
      .padding(.bottom, 24)
    }
    .navigationTitle("Listings")
    .navigationBarTitleDisplayMode(.inline)
    .searchable(
      text: $model.query, placement: .navigationBarDrawer(displayMode: .always),
      prompt: "Title or half-remembered plot"
    )
    .task(id: taskKey) { await reload() }
    .marqueePage()
  }

  private var taskKey: String {
    "\(model.filterKey)|\(appState.selectedProviderIDs.sorted().joined(separator: ","))"
  }

  private var filters: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("TYPE").font(MarqueeTheme.mono(9, weight: .bold)).foregroundStyle(MarqueeTheme.muted)
      HStack(spacing: 8) {
        filterButton("All", value: "")
        filterButton("Films", value: "movie")
        filterButton("Series", value: "tv")
        Spacer()
        Menu {
          ForEach(ListingsModel.Sort.allCases) { sort in
            Button(sort.label) { model.sort = sort }
          }
        } label: {
          Label(model.sort.label, systemImage: "arrow.up.arrow.down")
            .font(MarqueeTheme.mono(10, weight: .bold))
        }
      }
    }
  }

  private func filterButton(_ label: String, value: String) -> some View {
    Button(label) { model.mediaType = value }
      .font(MarqueeTheme.mono(10, weight: .bold))
      .foregroundStyle(model.mediaType == value ? MarqueeTheme.ink : MarqueeTheme.white)
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(model.mediaType == value ? MarqueeTheme.acid : MarqueeTheme.panel)
      .overlay {
        Rectangle().stroke(model.mediaType == value ? MarqueeTheme.acid : MarqueeTheme.line)
      }
  }

  private func reload() async {
    await model.reload(api: appState.api, providerIDs: appState.selectedProviderIDs.sorted())
  }

  private func loadMore() async {
    await model.loadMore(api: appState.api, providerIDs: appState.selectedProviderIDs.sorted())
  }
}
