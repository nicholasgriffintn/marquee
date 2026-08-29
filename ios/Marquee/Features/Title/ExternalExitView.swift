import SwiftUI

struct ExternalDestination: Identifiable {
  enum Kind {
    case provider
    case trailer
    case tmdb
    case wikipedia
    case imdb
    case cinema
    case other
  }

  var id: String { url.absoluteString }
  let url: URL
  let label: String
  let kind: Kind
  var titleId: String? = nil
  var providerId: String? = nil
  var monetization: String? = nil

  func reportExit() {
    guard kind == .provider, let titleId else { return }

    Telemetry.shared.record(
      .providerExit,
      titleId: titleId,
      detail: label,
      providerId: providerId,
      monetization: monetization
    )
  }

  var message: String {
    switch kind {
    case .provider:
      "\(label) is through that door. I don't work there, and I can't help you once you're through it."
    case .trailer:
      "The trailer is next door. They will try to sell you three more on the way out."
    case .tmdb:
      "The records office. Nearly everything I know about this came from in there."
    case .wikipedia:
      "The library. Mind the spoilers, they do not sort them."
    case .imdb:
      "Another lot's records. Perfectly good. Do not read the comments."
    case .cinema:
      "\(label). A proper house, with a proper screen. Go on, then — I'll still be here."
    case .other:
      "That is outside the building. I cannot vouch for it."
    }
  }
}

struct ExternalLinkButton<Label: View>: View {
  @Environment(\.openURL) private var openURL
  @AppStorage("marquee.skipExitWarning") private var skipsWarning = false
  @Binding var pendingDestination: ExternalDestination?
  let destination: ExternalDestination
  @ViewBuilder let label: () -> Label

  var body: some View {
    Button {
      if skipsWarning {
        destination.reportExit()
        openURL(destination.url)
      } else {
        pendingDestination = destination
      }
    } label: {
      label()
    }
  }
}

struct ExternalExitView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @AppStorage("marquee.skipExitWarning") private var skipsWarning = false
  @State private var rememberChoice = false
  let destination: ExternalDestination

  var body: some View {
    ZStack {
      Color.black.opacity(0.72).ignoresSafeArea().onTapGesture { dismiss() }
      VStack(spacing: 0) {
        Text("EXIT")
          .font(MarqueeTheme.mono(12, weight: .heavy))
          .tracking(8)
          .foregroundStyle(MarqueeTheme.ink)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
          .background(MarqueeTheme.acid)

        VStack(alignment: .leading, spacing: 0) {
          HStack(alignment: .top, spacing: 16) {
            Image("UsherUnimpressedHead")
              .resizable()
              .scaledToFit()
              .frame(width: 58, height: 42)
            VStack(alignment: .leading, spacing: 0) {
              Text("You are leaving the building.")
                .font(MarqueeTheme.serif(24, weight: .medium))
                .tracking(-0.5)
                .lineSpacing(-1)
                .padding(.bottom, 10)
              Text(destination.message)
                .font(MarqueeTheme.serif(16))
                .italic()
                .lineSpacing(3)
                .padding(.bottom, 14)
              (Text(destination.label.uppercased() + " ")
                .foregroundStyle(MarqueeTheme.muted)
                + Text(destinationHost.uppercased()).foregroundStyle(MarqueeTheme.acid))
                .font(MarqueeTheme.mono(10, weight: .bold))
                .tracking(1.4)
            }
          }
          .padding(.bottom, 22)

          HStack(spacing: 10) {
            Button("GO THROUGH", action: leave)
              .foregroundStyle(MarqueeTheme.ink)
              .background(MarqueeTheme.acid)
            Button("STAY HERE") { dismiss() }
              .foregroundStyle(MarqueeTheme.white)
              .overlay { Rectangle().stroke(MarqueeTheme.line) }
          }
          .font(MarqueeTheme.mono(12, weight: .bold))
          .tracking(1)
          .buttonStyle(ExitActionButtonStyle())
          .padding(.bottom, 16)

          Button {
            rememberChoice.toggle()
          } label: {
            HStack(spacing: 9) {
              Image(systemName: rememberChoice ? "checkmark.square.fill" : "square")
                .frame(width: 15, height: 15)
              Text("Stop telling me. I know where the door is.")
                .font(MarqueeTheme.sans(13))
            }
            .foregroundStyle(MarqueeTheme.muted)
          }
          .buttonStyle(.plain)
        }
        .padding(.horizontal, 26)
        .padding(.top, 24)
        .padding(.bottom, 24)
      }
      .background(MarqueeTheme.panel)
      .overlay { Rectangle().stroke(MarqueeTheme.line) }
      .background { Rectangle().fill(MarqueeTheme.blue).offset(x: 12, y: 12) }
      .frame(maxWidth: 480)
      .padding(24)
      .onTapGesture {}
    }
    .foregroundStyle(MarqueeTheme.white)
  }

  private var destinationHost: String {
    (destination.url.host ?? destination.url.absoluteString).replacingOccurrences(
      of: "^www\\.", with: "", options: .regularExpression)
  }

  private func leave() {
    if rememberChoice { skipsWarning = true }
    destination.reportExit()
    openURL(destination.url)
    dismiss()
  }
}

private struct ExitActionButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .frame(maxWidth: .infinity)
      .padding(.horizontal, 18)
      .padding(.vertical, 13)
      .opacity(configuration.isPressed ? 0.76 : 1)
  }
}
