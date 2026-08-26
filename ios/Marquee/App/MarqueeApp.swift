import SwiftUI

@main
struct MarqueeApp: App {
  @StateObject private var appState = AppState()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(appState)
        .task { await appState.restore() }
        .preferredColorScheme(.dark)
    }
  }
}
