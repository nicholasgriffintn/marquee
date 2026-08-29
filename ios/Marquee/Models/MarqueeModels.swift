import Foundation

struct MarqueeUser: Codable, Identifiable {
  let id: String
  let name: String
  let login: String
  let avatarUrl: URL?
  let role: String
}

struct SessionResponse: Codable {
  let user: MarqueeUser?
}

struct ProviderAvailability: Codable, Identifiable {
  let id: String
  let name: String
  let offerTypes: [String]
  let webUrl: URL?
  let source: String
}

struct TitleBuzz: Codable {
  let article: String?
  let articleUrl: URL?
  let match: String?
  let views: Int
  let previousViews: Int
  let delta: Double
  let measuredAt: String?
}

struct TitleRatings: Codable {
  let imdbScore: Double?
  let imdbVotes: Int?
  let rottenTomatoes: String?
  let metascore: Int?
  let awards: String?
  let awardWins: Int?
  let boxOffice: Int?
  let animeScore: Double?
  let animeVotes: Int?
}

struct TitleCollection: Codable {
  let id: Int
  let name: String
}

struct TitleVisualFormat: Codable {
  let colours: [String]
  let aspectRatios: [String]
}

struct TitleExternalIds: Codable {
  let letterboxdId: String?
  let rottenTomatoesId: String?
  let metacriticId: String?
  let traktId: String?
}

struct TitleVideo: Codable, Identifiable {
  var id: String { key }
  let key: String
  let name: String
  let type: String
}

struct MediaTitle: Codable, Identifiable {
  let id: String
  let tmdbId: Int
  let mediaType: String
  let title: String
  let originalTitle: String
  let overview: String
  let releaseDate: String?
  let year: Int?
  let runtimeMinutes: Int?
  let numberOfSeasons: Int?
  let episodeCount: Int?
  let genres: [String]
  let certification: String?
  let tmdbScore: Double?
  let tmdbVoteCount: Int
  let popularity: Double
  let posterUrl: URL?
  let backdropUrl: URL?
  let providers: [ProviderAvailability]
  let watchLink: URL?
  let tmdbUrl: URL
  let imdbUrl: URL?
  let tagline: String?
  let trailerKey: String?
  let buzz: TitleBuzz?
  let ratings: TitleRatings?
  let keywords: [String]?
  let originalLanguage: String?
  let status: String?
  let collection: TitleCollection?
  let studios: [String]?
  let countries: [String]?
  let languages: [String]?
  let revenue: Int?
  let budget: Int?
  let lastAirDate: String?
  let nextAirDate: String?
  let recommendationIds: [String]?
  let videos: [TitleVideo]?
  let visualFormat: TitleVisualFormat?
  let externalIds: TitleExternalIds?
}

struct CatalogSection: Codable, Identifiable {
  let id: String
  let title: String
  let description: String
  let items: [MediaTitle]
  let angle: String?
  let reason: String?
  let source: String?
  let generationId: String?

  var isCurated: Bool { source == "ai" }
  var telemetrySource: String { angle ?? id }
}

struct CatalogResponse: Codable {
  let sections: [CatalogSection]
  let source: String
  let availabilitySource: String
  let fetchedAt: String
}

struct FeaturedTitleResponse: Codable {
  let item: MediaTitle?
  let source: String?
  let fetchedAt: String
}

struct RailsDelivery: Codable {
  let status: String
  let revision: String
  let generationId: String
  let rails: [CatalogSection]

  var isBuilding: Bool { status == "generating" }
}

struct RailFeedbackRequest: Encodable {
  let railId: String
  let verdict: String
}

struct ScheduledEpisode: Codable, Identifiable {
  var id: String { "\(showName)-\(airsAt)" }
  let titleId: String?
  let showName: String
  let season: Int?
  let episode: Int?
  let episodeName: String?
  let airsAt: String
  let network: String?
  let item: MediaTitle?
}

struct TonightResponse: Codable {
  let episodes: [ScheduledEpisode]
  let fetchedAt: String
}

struct TrendingResponse: Codable {
  let items: [MediaTitle]
  let source: String
  let fetchedAt: String
}

struct BrowseResponse: Codable {
  let items: [MediaTitle]
  let hasMore: Bool
  let page: Int
}

struct GenresResponse: Codable { let genres: [String] }

struct KeywordsResponse: Codable { let keywords: [String] }

struct FilmingPlacesResponse: Codable { let places: [String] }

struct SearchResponse: Codable {
  let items: [MediaTitle]
}

enum EntryStatus: String, Codable, CaseIterable, Identifiable {
  case watchlist
  case watching
  case watched
  case dropped

  var id: String { rawValue }
  var label: String {
    switch self {
    case .watchlist: "On my watchlist"
    case .watching: "Watching"
    case .watched: "Watched"
    case .dropped: "Dropped"
    }
  }
}

struct ViewingEntry: Codable, Identifiable {
  var id: String { titleId }
  let titleId: String
  var status: EntryStatus
  var rating: Int?
  var thoughts: String
  let season: Int?
  let episode: Int?
  let updatedAt: String?

  init(titleId: String, status: EntryStatus = .watchlist, rating: Int? = nil, thoughts: String = "")
  {
    self.titleId = titleId
    self.status = status
    self.rating = rating
    self.thoughts = thoughts
    self.season = nil
    self.episode = nil
    self.updatedAt = nil
  }
}

struct EntryResponse: Codable {
  let entry: ViewingEntry?
}

struct ShelfItem: Codable, Identifiable {
  var id: String { title.id }
  let entry: ViewingEntry
  let title: MediaTitle
}

struct ShelfResponse: Codable {
  let items: [ShelfItem]
  let lost: [ShelfItem]
  let genres: [String]
  let matched: Int
  let shelved: Int
  let page: Int
  let pageSize: Int
  let hasMore: Bool
}

struct DigestResponse: Codable { let digest: Digest? }

struct Digest: Codable {
  struct Lead: Codable {
    let item: MediaTitle?
    let line: String
    let facts: [String]
  }

  struct Numbers: Codable {
    let added: Int
    let finished: Int
    let shelved: Int
    let catalogue: Int
  }

  struct Episode: Codable, Identifiable {
    var id: String { "\(showName)-\(airsAt)" }
    let titleId: String?
    let showName: String
    let season: Int?
    let episode: Int?
    let airsAt: String
  }

  let createdAt: String
  let lead: Lead?
  let numbers: Numbers
  let fresh: [MediaTitle]
  let trending: [MediaTitle]
  let episodes: [Episode]
}

struct RevivalCard: Codable, Identifiable {
  let id: String
  let title: String
  let year: Int?
  let country: String?
  let kind: String
  let runtimeSeconds: Int?
  let director: String?
  let stillUrl: URL?
  let mirrored: Bool
  let condition: String

  init(work: RevivalWork) {
    id = work.id
    title = work.title
    year = work.year
    country = work.country
    kind = work.kind
    runtimeSeconds = work.runtimeSeconds
    director = work.director
    stillUrl = work.stillUrl
    mirrored = work.mirrored
    condition = work.condition
  }
}

struct RevivalBillSlot: Codable, Identifiable {
  var id: String { "\(slot)-\(work.id)" }
  let slot: String
  let note: String
  let work: RevivalCard
}

struct RevivalShelf: Codable, Identifiable {
  let id: String
  let title: String
  let description: String
  let works: [RevivalCard]
}

struct RevivalVaultResponse: Codable {
  let total: Int
}

struct RevivalBillResponse: Codable {
  let bill: [RevivalBillSlot]
  let billDate: String
  let fetchedAt: String
}

struct RevivalShelvesResponse: Codable {
  let shelves: [RevivalShelf]
  let fetchedAt: String
}

struct RevivalResumeResponse: Codable {
  let works: [RevivalCard]
}

struct RevivalSearchResponse: Codable {
  let works: [RevivalCard]
}

struct RevivalTag: Codable, Identifiable {
  var id: String { "\(kind)-\(slug)" }
  let kind: String
  let slug: String
  let label: String
}

struct RevivalSynopsisCredit: Codable {
  let article: String
  let url: URL
}

struct RevivalWork: Codable, Identifiable {
  let id: String
  let source: String
  let sourceUrl: URL
  let title: String
  let year: Int?
  let director: String?
  let synopsis: String
  let synopsisCredit: RevivalSynopsisCredit?
  let kind: String
  let runtimeSeconds: Int?
  let stillUrl: URL?
  let rightsBasis: String
  let rightsNote: String
  let rightsUrl: URL?
  let titleId: String?
  let country: String?
  let ukClear: Bool
  let ukExpiresYear: Int?
  let mirrored: Bool
  let delivery: String
  let reelUrl: URL
  let streamBytes: Int?
  let height: Int?
  let downloads: Int?
  let condition: String
  let contentNotice: String?
  let tags: [RevivalTag]
}

struct RevivalPrint: Codable, Identifiable {
  let id: String
  let source: String
  let sourceUrl: URL
  let title: String
  let runtimeSeconds: Int?
  let condition: String
  let streamBytes: Int?
  let height: Int?
  let downloads: Int?
  let mirrored: Bool
}

struct RevivalScreening: Codable {
  let work: RevivalWork
  let prints: [RevivalPrint]
  let positionSeconds: Int
  let finished: Bool
  let alsoShowing: [RevivalWork]
}

struct RevivalProgressRequest: Encodable {
  let positionSeconds: Int
  let finished: Bool
}

struct NotebookResponse: Codable { let beliefs: [Belief] }

struct Belief: Codable, Identifiable {
  let id: String
  let key: String
  let value: String
  let strength: Double
  let confidence: Double
  let scope: String
  let edited: Bool
  let suspendedUntil: String?
  let evidence: Int
}

struct Guest: Codable, Identifiable {
  let id: String
  let name: String
  let vetoes: [String]
  let leanings: [String]
}

struct GuestResponse: Codable { let guests: [Guest] }

struct GuestSaveRequest: Encodable {
  let name: String
  let vetoes: [String]
}

struct MarqueeProvider: Codable, Identifiable {
  let id: String
  let mark: String
  let name: String
  let category: String
  let homepage: URL?
  let status: String?
  let tmdbProviderIds: [Int]?
}

struct ProvidersResponse: Codable { let providers: [MarqueeProvider] }

struct ProviderPreferences: Codable {
  let selectedProviderIds: [String]
  let isSaved: Bool
}

struct FeedKeys: Codable {
  let subscribed: Bool
  let createdAt: String?
  let lastUsedAt: String?
  let calendarUrl: URL?
  let alertsUrl: URL?
}

struct AlertKind: Codable, Identifiable {
  var id: String { kind }
  let kind: String
  let enabled: Bool
}

struct AlertConfiguration: Codable {
  let email: String
  let verified: Bool
  let kinds: [AlertKind]
}

struct AlertKindsResponse: Codable { let kinds: [AlertKind] }

struct AlertSettingRequest: Encodable {
  let kind: String
  let enabled: Bool
}

struct NativeTokenResponse: Codable { let token: String }

struct Acknowledgement: Codable {}

struct AuthMethodProvider: Codable, Identifiable {
  let id: String
  let label: String
}

struct AuthMethodsResponse: Codable {
  let providers: [AuthMethodProvider]
  let magicLink: Bool
}

struct CuratorRequest: Encodable {
  let prompt: String
  let providerIds: [String]
  let hour: Int
  let isWeekend: Bool
}

struct CuratorEvent: Decodable {
  let type: String
  let label: String?
  let items: [MediaTitle]?
  let text: String?
  let summary: String?
  let reasons: [String: String]?
  let message: String?
}

struct UsherPickRequest: Encodable {
  let providerIds: [String]
  let rejected: [String]
  let hour: Int
  let isWeekend: Bool
}

struct UsherPickResponse: Decodable {
  let item: MediaTitle?
  let line: String
  let facts: [String]
}
