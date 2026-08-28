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

struct AwardEntry: Codable, Identifiable {
  var id: String { "\(awardId)-\(ceremonyYear ?? 0)-\(outcome)" }
  let awardId: String
  let label: String
  let ceremonyYear: Int?
  let outcome: String
}

struct AwardSummary: Codable {
  let wins: Int
  let nominations: Int
  let entries: [AwardEntry]
  let summary: String?

  static let empty = AwardSummary(wins: 0, nominations: 0, entries: [], summary: nil)

  var isEmpty: Bool { entries.isEmpty && summary == nil }
}

struct TitlePlace: Codable, Identifiable {
  var id: String { entityId }
  let entityId: String
  let label: String
  let kind: String
  let latitude: Double
  let longitude: Double
  let pin: String
  let country: String?
  let isCountry: Bool

  var isVague: Bool { isCountry || pin == "centroid" }
}

struct TitlePlaces: Codable {
  let filming: [TitlePlace]
  let narrative: [TitlePlace]

  static let empty = TitlePlaces(filming: [], narrative: [])
}

struct SourceWork: Codable {
  let workId: String
  let label: String
  let workType: String?
  let publishedYear: Int?
  let authors: [String]
}

struct AdaptationsResponse: Codable {
  let source: SourceWork?
  let items: [MediaTitle]
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
