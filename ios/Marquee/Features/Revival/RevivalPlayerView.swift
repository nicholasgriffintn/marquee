import AVKit
import SwiftUI

struct RevivalPlayerView: View {
  let player: AVPlayer
  let work: RevivalWork
  let startAt: Int
  let hasStarted: Bool
  let onStart: () -> Void

  var body: some View {
    ZStack {
      VideoPlayer(player: player)
        .background(.black)

      if !hasStarted {
        Button(action: onStart) {
          ZStack(alignment: .bottomLeading) {
            Artwork(url: work.stillUrl, seed: work.id, aspectRatio: 16 / 9)
              .opacity(0.5)
            LinearGradient(
              colors: [MarqueeTheme.ink.opacity(0.86), MarqueeTheme.ink.opacity(0.28)],
              startPoint: .bottom,
              endPoint: .top
            )
            HStack(spacing: 14) {
              Image(systemName: "play.fill")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(MarqueeTheme.ink)
                .frame(width: 44, height: 44)
                .background(MarqueeTheme.acid)
              VStack(alignment: .leading, spacing: 3) {
                Text(isResuming ? "Back to your seat" : "Start the projector")
                  .font(MarqueeTheme.sans(15, weight: .bold))
                Text(isResuming ? "YOU LEFT IT AT \(revivalClockLabel(startAt))" : playerMeta)
                  .font(MarqueeTheme.mono(10))
                  .tracking(0.8)
                  .foregroundStyle(MarqueeTheme.muted)
              }
            }
            .padding(20)
          }
        }
        .buttonStyle(.plain)
        .transition(.move(edge: .top))
      }
    }
    .aspectRatio(16 / 9, contentMode: .fit)
    .clipped()
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }

  private var isResuming: Bool { startAt >= 5 }

  private var playerMeta: String {
    let runtime = revivalRuntime(work.runtimeSeconds)
    return (runtime.isEmpty ? work.title : runtime).uppercased()
  }
}
