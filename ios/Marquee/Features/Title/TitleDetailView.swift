import SwiftUI

struct TitleDetailView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model: TitleDetailModel
  @State private var confirmRemoval = false
  let item: MediaTitle

  init(item: MediaTitle) {
    self.item = item
    _model = StateObject(wrappedValue: TitleDetailModel(titleID: item.id))
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        TitleDetailHero(item: item)
        VStack(alignment: .leading, spacing: 28) {
          TitleOverview(item: item)
          TitleWatchOptions(item: item)
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
          } else {
            TicketGate(
              title: "Keep this on your shelf.",
              message: "A ticket lets you mark it, rate it and leave a note for the Usher."
            )
          }
          TitleSourceLinks(item: item)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 48)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .scrollIndicators(.hidden)
    .navigationTitle(item.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.hidden, for: .tabBar)
    .task(id: "\(item.id)-\(appState.isSignedIn)") {
      await model.load(api: appState.api, isSignedIn: appState.isSignedIn)
    }
    .confirmationDialog("Remove this title from your shelf?", isPresented: $confirmRemoval) {
      Button("Remove from shelf", role: .destructive) {
        Task { if await model.remove(api: appState.api) { appState.shelfDidChange() } }
      }
    }
    .marqueePage()
  }
}
