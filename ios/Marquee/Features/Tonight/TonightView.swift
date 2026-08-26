import SwiftUI

struct TonightView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = TonightModel()
  @State private var prompt = ""

  private var loadKey: String {
    "\(appState.isSignedIn)-\(appState.selectedProviderIDs.sorted().joined(separator: ","))"
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 32) {
        if model.isUsherActive {
          TonightUsherHero(
            prompt: model.curatorPrompt,
            status: model.curatorStatus,
            summary: model.curatorSummary,
            error: model.usherError,
            items: model.curated,
            pick: model.pick,
            isAsking: model.isAsking,
            isPicking: model.isPicking,
            onClear: {
              prompt = ""
              model.clearUsher()
            },
            onRefine: { value in
              Task {
                await model.ask(
                  value,
                  api: appState.api,
                  providerIDs: appState.selectedProviderIDs.sorted(),
                  isRefinement: true
                )
              }
            }
          )
        } else if let hero = model.sections.first?.items.first {
          TonightHero(item: hero)
        } else {
          MarqueeMasthead(
            eyebrow: "Tonight at Marquee",
            title: "Something worth sitting down for.",
            copy: "Your services, your shelf, and the whole catalogue — set out for this evening."
          )
          .padding(.horizontal, 18)
          .padding(.top, 16)
        }

        if !model.isUsherActive {
          TonightUsherConsole(
            prompt: $prompt,
            isAsking: model.isAsking,
            isPicking: model.isPicking,
            onAsk: { value in
              Task {
                await model.ask(
                  value,
                  api: appState.api,
                  providerIDs: appState.selectedProviderIDs.sorted()
                )
              }
            },
            onPick: pickSomething
          )
        }

        if !model.providers.isEmpty {
          TonightProviderStrip(
            providers: model.providers,
            selectedProviderIDs: appState.selectedProviderIDs,
            isSignedIn: appState.isSignedIn,
            onRequireSignIn: appState.requireSignIn,
            onSelect: { ids in Task { await appState.saveProviders(ids) } }
          )
        }

        if model.isLoading {
          LoadingHouse()
        } else if !model.error.isEmpty && model.sections.isEmpty {
          HouseMessage(title: "The board is blank.", message: model.error)
            .padding(.horizontal, 18)
        }

        if !model.trending.isEmpty {
          TitleRail(
            section: CatalogSection(
              id: "trending",
              title: "Trending now",
              description: "Wikipedia readers this week against last",
              items: model.trending,
              angle: nil,
              reason: nil
            ))
        }

        if !model.episodes.isEmpty {
          TonightEpisodeBoard(episodes: model.episodes)
            .padding(.horizontal, 18)
        }

        ForEach(model.sections) { TitleRail(section: $0) }
      }
      .padding(.bottom, 30)
    }
    .navigationTitle("Marquee")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: loadKey) {
      await model.load(
        api: appState.api,
        providerIDs: appState.selectedProviderIDs.sorted(),
        isSignedIn: appState.isSignedIn
      )
    }
    .refreshable {
      await model.load(
        api: appState.api,
        providerIDs: appState.selectedProviderIDs.sorted(),
        isSignedIn: appState.isSignedIn
      )
    }
    .marqueePage()
  }

  private func pickSomething() {
    if appState.isSignedIn {
      Task {
        await model.askForPick(
          api: appState.api,
          providerIDs: appState.selectedProviderIDs.sorted()
        )
      }
    } else {
      appState.requireSignIn()
    }
  }
}
