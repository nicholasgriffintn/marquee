import SwiftUI

struct RootView: View {
  @EnvironmentObject private var appState: AppState
  @State private var selection = MarqueeTab.tonight

  var body: some View {
    TabView(selection: $selection) {
      tab(.tonight, "Tonight", systemImage: "sparkles", view: TonightView())
      tab(.listings, "Listings", systemImage: "rectangle.grid.2x2", view: ListingsView())
      tab(.revival, "Revival", systemImage: "film.stack", view: RevivalView())
      tab(.shelf, "My shelf", systemImage: "books.vertical", view: ShelfView())
      tab(.more, "More", systemImage: "ellipsis", view: MoreView())
    }
    .marqueePage()
    .onChange(of: selection) { previous, current in
      guard current == .shelf, !appState.isSignedIn else { return }
      selection = previous
      appState.requireSignIn()
    }
    .fullScreenCover(isPresented: $appState.isPresentingSignIn) {
      NavigationStack { SignInView() }
        .environmentObject(appState)
        .preferredColorScheme(.dark)
    }
  }

  private func tab<Content: View>(
    _ tab: MarqueeTab,
    _ title: String,
    systemImage: String,
    view: Content
  ) -> some View {
    NavigationStack {
      view
        .toolbar { AccountToolbar() }
    }
    .tabItem { Label(title, systemImage: systemImage) }
    .tag(tab)
  }
}

private enum MarqueeTab: Hashable {
  case tonight
  case listings
  case revival
  case shelf
  case more
}
