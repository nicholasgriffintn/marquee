import SwiftUI

struct RevivalView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = RevivalModel()
  @AppStorage(RevivalGate.storageKey) private var hasAccepted = false
  @State private var query = ""

  private var isSearchActive: Bool {
    query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
  }

  var body: some View {
    if hasAccepted {
      house
    } else {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          RevivalPageTitle(total: 0)
            .padding(.bottom, 28)
          RevivalGateView { hasAccepted = true }
        }
        .padding(.horizontal, 18)
        .padding(.top, 30)
        .padding(.bottom, 95)
      }
      .marqueeRootPage()
    }
  }

  private var house: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        RevivalPageTitle(total: model.total)
          .padding(.bottom, 28)
        RevivalVaultSearch(
          query: $query,
          resultCount: model.searchResults.count,
          total: model.total,
          isSearching: model.isSearching
        )
        .padding(.bottom, 54)

        if model.isLoading && !model.hasProgramme {
          LoadingHouse(label: "Threading the projector…")
        } else if model.hasProgramme {
          if isSearchActive {
            RevivalSearchResultsView(results: model.searchResults, isSearching: model.isSearching)
              .padding(.bottom, 54)
          } else {
            RevivalBillView(bill: model.bill)
              .padding(.bottom, 54)
            ForEach(model.shelves) { shelf in
              RevivalShelfView(shelf: shelf)
                .padding(.bottom, 54)
            }
          }
          if !model.shelves.isEmpty {
            RevivalProjectionNote(seed: model.total)
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
    .task(id: appState.isSignedIn) {
      await model.load(api: appState.api, isSignedIn: appState.isSignedIn)
    }
    .refreshable { await model.load(api: appState.api, isSignedIn: appState.isSignedIn) }
    .onChange(of: query) { model.search(query: query, api: appState.api) }
    .marqueeRootPage()
  }
}
