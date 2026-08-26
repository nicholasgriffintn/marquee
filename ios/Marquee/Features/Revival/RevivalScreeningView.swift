import SwiftUI

struct RevivalScreeningView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = RevivalScreeningModel()
  @State private var pendingDestination: ExternalDestination?
  let workID: String

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        if model.isLoading {
          LoadingHouse(label: "Lacing the reel…")
            .padding(.top, 30)
        } else if let screening = model.screening {
          RevivalScreeningTitle(work: screening.work)
            .padding(.bottom, 18)
          if let notice = screening.work.contentNotice {
            RevivalContentNotice(notice: notice)
              .padding(.bottom, 18)
          }
          if let player = model.player {
            RevivalPlayerView(
              player: player,
              work: screening.work,
              startAt: screening.positionSeconds,
              hasStarted: model.hasStarted,
              onStart: {
                withAnimation(.easeInOut(duration: 0.46)) {
                  model.start(api: appState.api, canSave: appState.isSignedIn)
                }
              }
            )
            .padding(.bottom, 18)
          }
          RevivalPrintConditionView(condition: screening.work.condition)
            .padding(.bottom, 18)
          if !screening.work.synopsis.isEmpty {
            Text(screening.work.synopsis)
              .font(MarqueeTheme.sans(15))
              .lineSpacing(5)
              .padding(.bottom, 18)
          }
          if screening.work.tags.contains(where: { $0.kind != "language" }) {
            RevivalTagsView(tags: screening.work.tags)
              .padding(.bottom, 24)
          }
          RevivalProvenanceView(
            pendingDestination: $pendingDestination,
            work: screening.work,
            catalogueTitle: model.catalogueTitle
          )
          .padding(.bottom, 40)
          RevivalOtherPrintsView(prints: screening.prints)
            .padding(.bottom, 40)
          RevivalAlsoShowingView(works: screening.alsoShowing)
        } else {
          HouseMessage(title: "Nothing showing under that name.", message: model.error)
            .padding(.top, 30)
        }
      }
      .padding(.horizontal, 18)
      .padding(.top, 30)
      .padding(.bottom, 48)
    }
    .navigationTitle(model.screening?.work.title ?? "Now showing")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.hidden, for: .tabBar)
    .task(id: workID) { await model.load(id: workID, api: appState.api) }
    .onDisappear {
      Task {
        await model.reportProgress(api: appState.api, canSave: appState.isSignedIn)
        model.stop()
      }
    }
    .fullScreenCover(item: $pendingDestination) { destination in
      ExternalExitView(destination: destination)
    }
    .marqueePage()
  }
}
