import SwiftUI

struct RevivalView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = RevivalModel()
  @State private var query = ""

  private var isSearchActive: Bool {
    query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        RevivalPageTitle(total: model.programme?.total ?? 0)
          .padding(.bottom, 28)
        RevivalVaultSearch(
          query: $query,
          resultCount: model.searchResults.count,
          total: model.programme?.total ?? 0,
          isSearching: model.isSearching
        )
        .padding(.bottom, 54)

        if model.isLoading && model.programme == nil {
          LoadingHouse(label: "Threading the projector…")
        } else if let programme = model.programme {
          if isSearchActive {
            RevivalSearchResultsView(results: model.searchResults, isSearching: model.isSearching)
              .padding(.bottom, 54)
          } else {
            RevivalBillView(bill: programme.bill)
              .padding(.bottom, 54)
            ForEach(programme.shelves) { shelf in
              RevivalShelfView(shelf: shelf)
                .padding(.bottom, 54)
            }
          }
          if !programme.shelves.isEmpty {
            RevivalProjectionNote(seed: programme.total)
              .padding(.bottom, 28)
            RevivalRightsNote()
          }
        } else {
          HouseMessage(
            title: "Nothing threaded yet.",
            message:
              model.error.isEmpty
              ? "The projectionist is still going through the vault. Come back when he has found something worth showing."
              : model.error
          )
        }
      }
      .padding(.horizontal, 18)
      .padding(.top, 30)
      .padding(.bottom, 95)
    }
    .task { await model.load(api: appState.api) }
    .refreshable { await model.load(api: appState.api) }
    .onChange(of: query) { model.search(query: query, api: appState.api) }
    .marqueeRootPage()
  }
}
