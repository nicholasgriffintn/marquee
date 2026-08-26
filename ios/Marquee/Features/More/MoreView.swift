import SwiftUI

struct MoreView: View {
  @EnvironmentObject private var appState: AppState

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        MarqueePageHeader(
          title: "More",
          description: "Your week in print, and everything the Usher has written down."
        )

        VStack(spacing: 1) {
          destination(
            number: "05",
            title: "This week",
            copy: "A Monday-morning digest of what landed, what moved and what is next.",
            systemImage: "newspaper"
          ) {
            DigestView()
          }

          destination(
            number: "06",
            title: "Notebook",
            copy: "Services, taste, guests, alerts and the feeds leaving the building.",
            systemImage: "book.closed"
          ) {
            NotebookView()
          }
        }
        .overlay { Rectangle().stroke(MarqueeTheme.line) }

        Text("MARQUEE · ADMIT ONE")
          .font(MarqueeTheme.mono(9, weight: .bold))
          .tracking(1.3)
          .foregroundStyle(MarqueeTheme.muted)
          .frame(maxWidth: .infinity, alignment: .center)
          .padding(.top, 8)
      }
      .padding(20)
      .padding(.bottom, 72)
    }
    .marqueeRootPage()
  }

  private func destination<Destination: View>(
    number: String,
    title: String,
    copy: String,
    systemImage: String,
    @ViewBuilder destination: () -> Destination
  ) -> some View {
    Group {
      if appState.isSignedIn {
        NavigationLink {
          destination()
            .toolbar(.hidden, for: .tabBar)
        } label: {
          destinationLabel(number: number, title: title, copy: copy, systemImage: systemImage)
        }
      } else {
        Button(action: appState.requireSignIn) {
          destinationLabel(number: number, title: title, copy: copy, systemImage: systemImage)
        }
      }
    }
    .buttonStyle(.plain)
  }

  private func destinationLabel(
    number: String,
    title: String,
    copy: String,
    systemImage: String
  ) -> some View {
    HStack(alignment: .top, spacing: 16) {
      Text(number)
        .font(MarqueeTheme.mono(10, weight: .bold))
        .foregroundStyle(MarqueeTheme.ink)
        .frame(width: 38, height: 38)
        .background(MarqueeTheme.acid)

      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Label(title, systemImage: systemImage)
            .font(MarqueeTheme.display(24))
            .fontWeight(.semibold)
          Spacer()
          Image(systemName: "arrow.right")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(MarqueeTheme.acid)
        }
        Text(copy)
          .font(MarqueeTheme.sans(13))
          .foregroundStyle(MarqueeTheme.muted)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(17)
    .background(MarqueeTheme.panel)
  }
}
