import Foundation

@MainActor
final class ListingsModel: ObservableObject {
  enum Sort: String, CaseIterable, Identifiable {
    case popularity
    case trending
    case score
    case recent

    var id: String { rawValue }
    var label: String {
      switch self {
      case .popularity: "Popular"
      case .trending: "Trending"
      case .score: "Highest rated"
      case .recent: "Newest"
      }
    }
  }

  @Published var query = ""
  @Published var mediaType = ""
  @Published var sort = Sort.popularity
  @Published var selectedGenres: Set<String> = []
  @Published var selectedKeywords: Set<String> = []
  @Published var selectedPlaces: Set<String> = []
  @Published var selectedProviderIDs: Set<String> = []
  @Published private(set) var items: [MediaTitle] = []
  @Published private(set) var genres: [String] = []
  @Published private(set) var keywords: [String] = []
  @Published private(set) var places: [String] = []
  @Published private(set) var providers: [MarqueeProvider] = []
  @Published private(set) var hasMore = false
  @Published private(set) var isLoading = false
  @Published private(set) var error = ""
  private var page = 0
  private var isLoadingFacets = false
  private var loadedFacets = false

  var filterKey: String {
    [
      query, mediaType, sort.rawValue, selectedGenres.sorted().joined(separator: ","),
      selectedKeywords.sorted().joined(separator: ","),
      selectedPlaces.sorted().joined(separator: ","),
      selectedProviderIDs.sorted().joined(separator: ","),
    ].joined(separator: "|")
  }

  var hasFilters: Bool {
    !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !mediaType.isEmpty
      || sort != .popularity || !selectedGenres.isEmpty || !selectedKeywords.isEmpty
      || !selectedPlaces.isEmpty || !selectedProviderIDs.isEmpty
  }

  var ranksResults: Bool { sort == .popularity || sort == .trending }

  var hasAdvancedFilters: Bool {
    !selectedGenres.isEmpty || !selectedKeywords.isEmpty || !selectedPlaces.isEmpty
      || !selectedProviderIDs.isEmpty
  }

  func loadFacets(api: APIClient) async {
    guard !loadedFacets, !isLoadingFacets else { return }
    isLoadingFacets = true
    defer { isLoadingFacets = false }

    async let genreValues = fetchGenres(api: api)
    async let keywordValues = fetchKeywords(api: api)
    async let placeValues = fetchPlaces(api: api)
    async let providerValues = fetchProviders(api: api)

    let values = await (genreValues, keywordValues, placeValues, providerValues)
    guard !Task.isCancelled else { return }
    genres = values.0
    keywords = values.1
    places = values.2
    providers = values.3.filter { $0.isSelectable }
    loadedFacets = true
  }

  func reload(api: APIClient) async {
    do {
      try await Task.sleep(for: .milliseconds(220))
      try Task.checkCancellation()
    } catch { return }

    page = 0
    await load(api: api, appending: false)
  }

  func loadMore(api: APIClient) async {
    guard hasMore, !isLoading else { return }
    page += 1
    await load(api: api, appending: true)
  }

  func toggleGenre(_ genre: String) {
    if selectedGenres.contains(genre) {
      selectedGenres.remove(genre)
    } else {
      selectedGenres.insert(genre)
    }
  }

  func toggleKeyword(_ keyword: String) {
    if selectedKeywords.contains(keyword) {
      selectedKeywords.remove(keyword)
    } else {
      selectedKeywords.insert(keyword)
    }
  }

  func togglePlace(_ place: String) {
    if selectedPlaces.contains(place) {
      selectedPlaces.remove(place)
    } else {
      selectedPlaces.insert(place)
    }
  }

  func toggleProvider(_ id: String) {
    if selectedProviderIDs.contains(id) {
      selectedProviderIDs.remove(id)
    } else {
      selectedProviderIDs.insert(id)
    }
  }

  func clearFilters() {
    query = ""
    mediaType = ""
    sort = .popularity
    selectedGenres = []
    selectedKeywords = []
    selectedPlaces = []
    selectedProviderIDs = []
  }

  private func load(api: APIClient, appending: Bool) async {
    isLoading = true
    error = ""
    var queryItems = [
      URLQueryItem(name: "sort", value: sort.rawValue),
      URLQueryItem(name: "page", value: String(page)),
    ]
    if !query.trimmingCharacters(in: .whitespaces).isEmpty {
      queryItems.append(
        URLQueryItem(name: "query", value: query.trimmingCharacters(in: .whitespaces)))
    }
    if !mediaType.isEmpty { queryItems.append(URLQueryItem(name: "mediaType", value: mediaType)) }
    if !selectedGenres.isEmpty {
      queryItems.append(
        URLQueryItem(name: "genres", value: selectedGenres.sorted().joined(separator: ",")))
    }
    if !selectedKeywords.isEmpty {
      queryItems.append(
        URLQueryItem(name: "keywords", value: selectedKeywords.sorted().joined(separator: ",")))
    }
    if !selectedPlaces.isEmpty {
      queryItems.append(
        URLQueryItem(name: "places", value: selectedPlaces.sorted().joined(separator: ",")))
    }
    if !selectedProviderIDs.isEmpty {
      queryItems.append(
        URLQueryItem(
          name: "providers", value: selectedProviderIDs.sorted().joined(separator: ",")))
    }

    do {
      let response: BrowseResponse = try await api.get("/api/catalog/browse", query: queryItems)
      items = appending ? items + response.items : response.items
      hasMore = response.hasMore
    } catch {
      self.error = error.localizedDescription
      if !appending { items = [] }
    }
    isLoading = false
  }

  private func fetchGenres(api: APIClient) async -> [String] {
    do {
      let response: GenresResponse = try await api.get(
        "/api/catalog/genres", query: [URLQueryItem(name: "limit", value: "18")])
      return response.genres
    } catch {
      return []
    }
  }

  private func fetchKeywords(api: APIClient) async -> [String] {
    do {
      let response: KeywordsResponse = try await api.get(
        "/api/catalog/keywords", query: [URLQueryItem(name: "limit", value: "28")])
      return response.keywords
    } catch {
      return []
    }
  }

  private func fetchPlaces(api: APIClient) async -> [String] {
    do {
      let response: FilmingPlacesResponse = try await api.get(
        "/api/catalog/places", query: [URLQueryItem(name: "limit", value: "24")])
      return response.places
    } catch {
      return []
    }
  }

  private func fetchProviders(api: APIClient) async -> [MarqueeProvider] {
    do {
      let response: ProvidersResponse = try await api.get("/api/catalog/providers")
      return response.providers
    } catch {
      return []
    }
  }
}
