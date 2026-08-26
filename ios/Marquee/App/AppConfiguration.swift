import Foundation

enum AppConfiguration {
  static let baseURL: URL = {
    let configured = Bundle.main.object(forInfoDictionaryKey: "MARQUEE_API_BASE_URL") as? String
    return URL(string: configured ?? "") ?? URL(string: "https://marquee.pashi.app")!
  }()
}
