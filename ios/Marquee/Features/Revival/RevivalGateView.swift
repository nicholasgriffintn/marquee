import SwiftUI

enum RevivalGate {
  static let storageKey = "revivalGateAccepted"
}

struct RevivalGateView: View {
  let onAccept: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      AsyncImage(url: AppConfiguration.baseURL.appending(path: "/usher-thinking.png")) { image in
        image.resizable().scaledToFit()
      } placeholder: {
        Color.clear
      }
      .frame(height: 150)
      Text("THE DOOR AT THE BACK")
        .font(MarqueeTheme.mono(10, weight: .bold))
        .tracking(1.4)
        .foregroundStyle(MarqueeTheme.acid)
      Text("Before you go through.")
        .font(MarqueeTheme.display(31))
        .fontWeight(.semibold)
      Text(
        "The revival house shows prints as they were made. Some are a century old and carry the attitudes of their day, some are propaganda kept for the record, and a few say on their own page exactly what is in them. Nothing is cut and nothing is softened. Go in knowing that, and knowing that what plays is your choice."
      )
      .font(MarqueeTheme.sans(15))
      .foregroundStyle(MarqueeTheme.muted)
      .lineSpacing(4)
      Button(action: onAccept) {
        Label("I understand. Let me in.", systemImage: "door.left.hand.open")
          .font(MarqueeTheme.mono(12, weight: .bold))
          .foregroundStyle(MarqueeTheme.ink)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 13)
          .background(MarqueeTheme.acid)
      }
    }
    .padding(24)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }
}

struct RevivalGatedMessage: View {
  @EnvironmentObject private var appState: AppState
  let message: String

  var body: some View {
    if appState.isSignedIn {
      VStack(alignment: .leading, spacing: 14) {
        HouseMessage(title: "Behind the curtain.", message: message)
        NavigationLink {
          NotebookView()
            .toolbar(.hidden, for: .tabBar)
        } label: {
          Label("Open the notebook", systemImage: "book.closed")
            .font(MarqueeTheme.mono(12, weight: .bold))
            .foregroundStyle(MarqueeTheme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(MarqueeTheme.acid)
        }
      }
    } else {
      TicketGate(title: "Behind the curtain.", message: message)
    }
  }
}
