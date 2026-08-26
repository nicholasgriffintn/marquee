import SwiftUI

struct ListingsView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = ListingsModel()

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        MarqueePageHeader(
          title: "Listings",
          description: "Everything in the building. Narrow it down and I will get out of your way."
        )
        ListingsFilters(model: model)

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
          TitleGrid(items: model.items, ranked: model.ranksResults)
          if model.hasMore {
            Button {
              Task { await model.loadMore(api: appState.api) }
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
    .task { await model.loadFacets(api: appState.api) }
    .task(id: model.filterKey) { await model.reload(api: appState.api) }
    .task {
      let query = appState.catalogueSearchQuery
      if model.query != query { model.query = query }
    }
    .onChange(of: appState.catalogueSearchQuery) { _, query in
      if model.query != query { model.query = query }
    }
    .onChange(of: model.query) { _, query in
      if appState.catalogueSearchQuery != query { appState.catalogueSearchQuery = query }
    }
    .marqueeRootPage()
  }
}
