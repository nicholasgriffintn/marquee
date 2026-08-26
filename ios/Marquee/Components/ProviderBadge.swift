import SwiftUI

enum ProviderPresentation {
  private static let pngLogoIDs: Set<String> = [
    "acorn-tv", "aha", "amazon-video", "amc-plus", "apple-tv-plus", "apple-tv-store", "arrow",
    "bbc-iplayer", "bfi-player", "broadwayhd", "channel-5", "crunchyroll", "cultpix",
    "curiosity-stream", "curzon-home-cinema", "dafilms", "dazn", "dekkoo", "discovery-plus",
    "disney-plus", "docplay", "dropout", "eros-now", "eventive", "f1-tv", "fifa-plus",
    "filmbox-plus", "freely", "gaia", "google-play", "guidedoc", "hayu", "hbo-max", "hidive",
    "history-hit", "hoichoi", "hotstar", "iqiyi", "itvx", "klassiki", "kocowa-plus",
    "lg-channels", "love-nature", "magellantv", "manoramamax", "marquee-tv", "microsoft-store",
    "mlb-tv", "mubi", "national-theatre-at-home", "nba-league-pass", "nebula", "netflix",
    "nfl-game-pass", "now", "outtv", "paramount-plus", "plex", "pluto-tv", "premier-sports",
    "prime-video", "rakuten-tv", "rakuten-tv-free", "rakuten-viki", "red-bull-tv", "revry",
    "rugbypass-tv", "s4c-clic", "samsung-tv-plus", "shahid", "shudder", "simply-south",
    "sky-go", "sky-store", "sonyliv", "stageplayer-plus", "sun-nxt", "sundance-now",
    "true-story", "tubi", "ufc-fight-pass", "wetv", "wow-presents-plus", "youtube",
    "youtube-movies", "zee5",
  ]

  private static let svgOnlyMarks = [
    "channel-4": "4",
    "mgm-plus": "MGM+",
    "qello-concerts": "Q",
    "royal-opera-house-stream": "ROH",
    "stv-player": "STV",
    "tennis-tv": "TTV",
    "u": "U",
  ]

  static func logoURL(for providerID: String) -> URL? {
    guard pngLogoIDs.contains(providerID) else { return nil }
    return AppConfiguration.assetURL(path: "providers/\(providerID).png")
  }

  static func mark(for providerID: String, name: String) -> String {
    svgOnlyMarks[providerID] ?? String(name.prefix(2)).uppercased()
  }
}

struct ProviderBadge: View {
  let providerID: String
  let name: String
  var size: CGFloat = 30

  var body: some View {
    AsyncImage(url: ProviderPresentation.logoURL(for: providerID)) { phase in
      if case .success(let image) = phase {
        image.resizable().scaledToFit()
      } else {
        Text(ProviderPresentation.mark(for: providerID, name: name))
          .font(MarqueeTheme.mono(max(7, size * 0.24), weight: .heavy))
          .foregroundStyle(MarqueeTheme.ink)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(MarqueeTheme.paperDeep)
      }
    }
    .frame(width: size, height: size)
    .clipped()
    .accessibilityHidden(true)
  }
}
