import SwiftUI
import WebKit

struct TitleTrailerView: View {
  let item: MediaTitle
  @Binding var pendingDestination: ExternalDestination?
  @State private var activeVideoKey: String?

  private var videos: [TitleVideo] {
    let listed: [TitleVideo]
    if let itemVideos = item.videos, !itemVideos.isEmpty {
      listed = itemVideos
    } else if let key = item.trailerKey {
      listed = [TitleVideo(key: key, name: "Trailer", type: "Trailer")]
    } else {
      listed = []
    }
    var seen = Set<String>()
    return listed.filter { isValidYouTubeVideoKey($0.key) && seen.insert($0.key).inserted }
  }

  private var selectedVideo: TitleVideo? {
    videos.first(where: { $0.key == activeVideoKey }) ?? videos.first
  }

  var body: some View {
    if let video = selectedVideo {
      VStack(alignment: .leading, spacing: 8) {
        if activeVideoKey != nil {
          YouTubePlayerView(videoKey: video.key)
            .aspectRatio(16 / 9, contentMode: .fit)
            .background(.black)
        } else {
          Button {
            activeVideoKey = video.key
          } label: {
            Artwork(
              url: item.backdropUrl ?? item.posterUrl,
              seed: item.id,
              aspectRatio: 16 / 9
            )
            .opacity(0.72)
            .overlay(alignment: .bottomLeading) {
              HStack(spacing: 8) {
                Image(systemName: "play.fill")
                Text(video.type == "Trailer" ? "Play trailer" : "Play \(video.type.lowercased())")
              }
              .font(MarqueeTheme.mono(11, weight: .bold))
              .tracking(0.8)
              .textCase(.uppercase)
              .foregroundStyle(MarqueeTheme.ink)
              .padding(.horizontal, 14)
              .padding(.vertical, 9)
              .background(MarqueeTheme.acid)
              .padding(14)
            }
          }
          .buttonStyle(.plain)
        }
        if videos.count > 1 {
          FlowLayout(spacing: 6) {
            ForEach(videos) { choice in
              Button(shortVideoName(choice.name)) { activeVideoKey = choice.key }
                .font(MarqueeTheme.mono(10, weight: .bold))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(
                  activeVideoKey == choice.key ? MarqueeTheme.blue : MarqueeTheme.ink
                )
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .overlay {
                  Rectangle().stroke(
                    activeVideoKey == choice.key ? MarqueeTheme.blue : MarqueeTheme.paperLine)
                }
            }
          }
        }
        if let url = URL(string: "https://www.youtube.com/watch?v=\(video.key)") {
          ExternalLinkButton(
            pendingDestination: $pendingDestination,
            destination: ExternalDestination(url: url, label: "YouTube", kind: .trailer)
          ) {
            HStack(spacing: 6) {
              Spacer()
              Text("Watch on YouTube")
              Image(systemName: "arrow.up.right")
            }
            .font(MarqueeTheme.mono(10, weight: .bold))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(MarqueeTheme.mutedOnPaper)
            .frame(maxWidth: .infinity)
          }
        }
      }
    }
  }

  private func shortVideoName(_ name: String) -> String {
    name.count > 26 ? String(name.prefix(26)) + "…" : name
  }
}

private struct YouTubePlayerView: UIViewRepresentable {
  let videoKey: String

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.isScrollEnabled = false
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    guard webView.url == nil else { return }
    let html = """
      <html><head><meta name="viewport" content="width=device-width"></head>
      <body style="margin:0;background:#000;overflow:hidden">
      <iframe width="100%" height="100%"
        src="https://www.youtube-nocookie.com/embed/\(videoKey)?autoplay=1&rel=0&modestbranding=1&playsinline=1"
        frameborder="0" allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen></iframe></body></html>
      """
    webView.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
  }
}
