import SwiftUI

struct SignInView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = SignInModel()

  var body: some View {
    ScrollView {
      VStack(spacing: 30) {
        BoxOfficeBulbs()
        ticketWindow
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 40)
    }
    .navigationTitle("Box office")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button("Close", systemImage: "xmark") { appState.dismissSignIn() }
          .disabled(appState.isSigningIn)
      }
    }
    .task { await model.load(api: appState.api) }
    .interactiveDismissDisabled(appState.isSigningIn)
    .marqueePage()
  }

  private var ticketWindow: some View {
    VStack(spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        Text("BOX OFFICE")
          .font(MarqueeTheme.mono(10, weight: .bold))
          .tracking(2.5)
        Spacer()
        Text("Open all hours")
          .font(MarqueeTheme.serif(13))
          .italic()
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
      .padding(.horizontal, 22)
      .padding(.vertical, 16)
      dashedRule

      VStack(alignment: .leading, spacing: 20) {
        Text("Admit one.")
          .font(MarqueeTheme.serif(42, weight: .medium))
          .tracking(-1.2)

        Text(
          "Tickets are free. I only need to know whose seat it is, so I can keep your shelf and stop offering you things you have already seen."
        )
        .font(MarqueeTheme.sans(15))
        .foregroundStyle(MarqueeTheme.mutedOnPaper)
        .lineSpacing(4)

        signInControl

        if !appState.authenticationError.isEmpty {
          Text(appState.authenticationError)
            .font(MarqueeTheme.sans(13))
            .foregroundStyle(MarqueeTheme.coral)
            .accessibilityLabel("Sign-in error: \(appState.authenticationError)")
        }

        Text("We keep your name and avatar, nothing else. Your shelf stays yours.")
          .font(MarqueeTheme.sans(12))
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(22)

      dashedRule
      HStack {
        Text("ADMIT ONE").font(MarqueeTheme.mono(10, weight: .heavy)).tracking(2.4)
        Spacer()
        Text("MARQUEE · EST. 1974")
          .font(MarqueeTheme.mono(8, weight: .bold))
          .tracking(1.1)
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
      .padding(.horizontal, 22)
      .padding(.vertical, 15)
    }
    .foregroundStyle(MarqueeTheme.ink)
    .background(MarqueeTheme.paper)
    .background { Rectangle().fill(MarqueeTheme.blue).offset(x: 8, y: 8) }
  }

  @ViewBuilder private var signInControl: some View {
    if model.isLoading {
      HStack(spacing: 10) {
        ProgressView().tint(MarqueeTheme.blue)
        Text("Opening the window…")
      }
      .font(MarqueeTheme.sans(13))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(12)
      .background(MarqueeTheme.acid)
      .foregroundStyle(MarqueeTheme.blue)
    } else if let github = model.github {
      Button {
        Task { await appState.signIn() }
      } label: {
        HStack(spacing: 10) {
          if appState.isSigningIn {
            ProgressView().tint(MarqueeTheme.paper)
          }
          Text(appState.isSigningIn ? "Opening GitHub…" : github.label)
        }
        .font(MarqueeTheme.sans(13, weight: .heavy))
        .foregroundStyle(MarqueeTheme.paper)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(MarqueeTheme.ink)
      }
      .buttonStyle(.plain)
      .disabled(appState.isSigningIn)
    } else {
      Text(model.error)
        .font(MarqueeTheme.sans(13))
        .foregroundStyle(MarqueeTheme.coral)
    }
  }

  private var dashedRule: some View {
    GeometryReader { proxy in
      Path { path in
        path.move(to: CGPoint(x: 0, y: 0.5))
        path.addLine(to: CGPoint(x: proxy.size.width, y: 0.5))
      }
      .stroke(MarqueeTheme.paperLine, style: StrokeStyle(lineWidth: 1, dash: [3, 5]))
    }
    .frame(height: 1)
    .clipped()
    .accessibilityHidden(true)
  }
}

private struct BoxOfficeBulbs: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private let count = 16
  private let deadIndex = 6
  private let duration = 2.6

  var body: some View {
    TimelineView(.animation(minimumInterval: 1 / 24, paused: reduceMotion)) { context in
      HStack {
        ForEach(0..<count, id: \.self) { index in
          Circle()
            .fill(index == deadIndex ? MarqueeTheme.line : MarqueeTheme.acid)
            .frame(width: 9, height: 9)
            .opacity(opacity(at: context.date, index: index))
          if index < count - 1 { Spacer() }
        }
      }
      .padding(.top, 22)
    }
    .accessibilityHidden(true)
  }

  private func opacity(at date: Date, index: Int) -> Double {
    guard index != deadIndex else { return 1 }
    guard !reduceMotion else { return 0.55 }

    let oneBasedIndex = index + 1
    let delay = oneBasedIndex.isMultiple(of: 3) ? 0.9 : oneBasedIndex % 3 == 1 ? 1.8 : 0
    let elapsed = (date.timeIntervalSinceReferenceDate - delay).truncatingRemainder(
      dividingBy: duration)
    let phase = (elapsed < 0 ? elapsed + duration : elapsed) / duration

    if phase <= 0.35 { return 0.22 + (phase / 0.35) * 0.78 }
    if phase <= 0.70 { return 1 - ((phase - 0.35) / 0.35) * 0.78 }
    return 0.22
  }
}
