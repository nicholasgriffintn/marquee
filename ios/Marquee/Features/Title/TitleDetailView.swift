import SwiftUI

struct TitleDetailView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model: TitleDetailModel
  @State private var confirmRemoval = false
  @State private var pendingDestination: ExternalDestination?
  @State private var creditsPage = 1
  @State private var creditsSeason: Int?
  let item: MediaTitle

  init(item: MediaTitle) {
    self.item = item
    _model = StateObject(wrappedValue: TitleDetailModel(titleID: item.id))
  }

  var body: some View {
    ScrollViewReader { scrollProxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          TitleDetailHero(item: item)
          VStack(alignment: .leading, spacing: 28) {
            TitleOverview(item: item)
            TitleInsightView(insight: model.insight, isLoading: model.isLoadingDetails)
            if appState.isSignedIn {
              TitleShelfEditor(
                entry: $model.entry,
                isSaving: model.isSaving,
                hasExistingEntry: model.hasExistingEntry,
                message: model.message,
                onSave: {
                  Task {
                    if await model.save(api: appState.api) { appState.shelfDidChange() }
                  }
                },
                onRemove: { confirmRemoval = true }
              )
            }
            TitleAirStatusView(item: item, nextEpisode: model.nextEpisode)
            TitleWatchOptions(
              item: item,
              providers: model.availabilityProviders ?? item.providers,
              selectedProviderIDs: appState.selectedProviderIDs,
              pendingDestination: $pendingDestination
            )
            TitleTrailerView(item: item, pendingDestination: $pendingDestination)
            TitleScoreView(item: item)
            if let buzz = item.buzz {
              TitleBuzzView(buzz: buzz, pendingDestination: $pendingDestination)
            }
            TitleCreditsView(
              credits: model.credits,
              seasons: model.creditSeasons,
              isLoading: model.isLoadingCredits,
              selectedSeason: creditsSeason,
              onSeason: changeCreditsSeason,
              onBack: { changeCreditsPage(to: max(1, creditsPage - 1)) },
              onMore: { changeCreditsPage(to: creditsPage + 1) }
            )
            .id("title-credits")
            TitleKeywordsView(keywords: item.keywords ?? [])
            TitleInsightRail(pairs: model.insightPairs)
            if let collection = item.collection {
              TitleDetailRail(
                label: collection.name, items: model.collectionItems, currentID: item.id)
            }
            TitleDetailRail(
              label: "More like this", items: model.recommendations, currentID: item.id)
            TitleSourceLinks(item: item, pendingDestination: $pendingDestination)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 20)
          .padding(.top, 28)
          .padding(.bottom, 48)
          .background(MarqueeTheme.paper)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .onChange(of: creditsPage) { scrollProxy.scrollTo("title-credits", anchor: .top) }
      .onChange(of: creditsSeason) { scrollProxy.scrollTo("title-credits", anchor: .top) }
    }
    .scrollIndicators(.hidden)
    .background(MarqueeTheme.paper)
    .navigationTitle(item.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.hidden, for: .tabBar)
    .task(id: "\(item.id)-\(appState.isSignedIn)") {
      await model.load(item: item, api: appState.api, isSignedIn: appState.isSignedIn)
    }
    .confirmationDialog("Remove this title from your shelf?", isPresented: $confirmRemoval) {
      Button("Remove from shelf", role: .destructive) {
        Task { if await model.remove(api: appState.api) { appState.shelfDidChange() } }
      }
    }
    .fullScreenCover(item: $pendingDestination) { destination in
      ExternalExitView(destination: destination)
    }
    .marqueePage()
  }

  private func changeCreditsPage(to page: Int) {
    creditsPage = page
    Task {
      await model.loadCredits(page: page, season: creditsSeason, api: appState.api)
    }
  }

  private func changeCreditsSeason(to season: Int?) {
    creditsSeason = season
    creditsPage = 1
    Task { await model.loadCredits(page: 1, season: season, api: appState.api) }
  }
}
