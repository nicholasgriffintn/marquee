import Foundation

enum AppConfiguration {
  static let baseURL: URL = {
    let configured = Bundle.main.object(forInfoDictionaryKey: "MARQUEE_API_BASE_URL") as? String
    return URL(string: configured ?? "") ?? URL(string: "https://marquee.pashi.app")!
  }()

  static let userAgent: String = {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    return "Marquee-iOS/\(version ?? "unknown") (app.pashi.marquee; iOS)"
  }()

  static func resolve(_ url: URL?) -> URL? {
    guard let url else { return nil }
    guard url.scheme == nil else { return url }

    return URL(string: url.relativeString, relativeTo: baseURL)?.absoluteURL
  }

  static func assetURL(path: String) -> URL {
    baseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
  }
}
