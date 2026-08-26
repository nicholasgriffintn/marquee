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
        if let hero = model.sections.first?.items.first {
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

        if !model.providers.isEmpty {
          TonightProviderStrip(
            providers: model.providers,
            selectedProviderIDs: appState.selectedProviderIDs,
            onSelect: { ids in Task { await appState.saveProviders(ids) } }
          )
        }

        if model.isLoading {
          LoadingHouse()
        } else if !model.error.isEmpty && model.sections.isEmpty {
          HouseMessage(title: "The board is blank.", message: model.error)
            .padding(.horizontal, 18)
        }

        if !model.curated.isEmpty {
          TitleRail(
            section: CatalogSection(
              id: "curator",
              title: "The Usher found these",
              description: model.curatorSummary,
              items: model.curated,
              angle: nil,
              reason: nil
            ))
        }

        if let pick = model.pick, let item = pick.item {
          TonightPickCard(item: item, response: pick)
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
      Task { await appState.signIn() }
    }
  }
}
