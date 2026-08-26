import Foundation

struct TitleInsight: Codable {
  let hook: String
  let moods: [String]
}

struct InsightPair: Codable, Identifiable {
  var id: String { item.id }
  let item: MediaTitle
  let reason: String
}

struct InsightResponse: Codable {
  let insight: TitleInsight?
  let pairs: [InsightPair]
}

struct TitleCredit: Codable, Identifiable {
  var id: String {
    "\(personId)-\(department)-\(job ?? "")-\(character ?? "")-\(episodeNumber ?? 0)"
  }

  let personId: Int
  let name: String
  let profilePath: String?
  let department: String
  let job: String?
  let character: String?
  let billing: Int?
  let seasonNumber: Int?
  let episodeNumber: Int?
  let episodeCount: Int?
}

struct CreditSeason: Codable, Identifiable {
  var id: Int { season }
  let season: Int
  let credits: Int
  let episodes: Int
}

struct CreditsResponse: Codable {
  let cast: [TitleCredit]
  let crew: [TitleCredit]
  let seasons: [CreditSeason]
  let total: Int
  let page: Int
  let hasMore: Bool

  static func empty(page: Int = 1) -> CreditsResponse {
    CreditsResponse(cast: [], crew: [], seasons: [], total: 0, page: page, hasMore: false)
  }
}

struct TitleItemsResponse: Codable {
  let items: [MediaTitle]
}

struct TitleCollectionResponse: Codable {
  let items: [MediaTitle]
  let hasMore: Bool
  let page: Int
}

struct TitleNextEpisode: Codable {
  let season: Int?
  let episode: Int?
  let episodeName: String?
  let airsAt: String
  let network: String?
}

struct TitleAvailabilityResponse: Codable {
  let providers: [ProviderAvailability]
  let nextEpisode: TitleNextEpisode?
  let checked: Bool?
}
