import Foundation

@MainActor
final class TitleDetailModel: ObservableObject {
  @Published var entry: ViewingEntry
  @Published private(set) var isLoading = false
  @Published private(set) var isLoadingDetails = false
  @Published private(set) var isSaving = false
  @Published private(set) var hasExistingEntry = false
  @Published private(set) var insight: TitleInsight?
  @Published private(set) var insightPairs: [InsightPair] = []
  @Published private(set) var credits = CreditsResponse.empty()
  @Published private(set) var creditSeasons: [CreditSeason] = []
  @Published private(set) var isLoadingCredits = false
  @Published private(set) var recommendations: [MediaTitle] = []
  @Published private(set) var collectionItems: [MediaTitle] = []
  @Published private(set) var availabilityProviders: [ProviderAvailability]?
  @Published private(set) var nextEpisode: TitleNextEpisode?
  @Published var message = ""

  init(titleID: String) {
    entry = ViewingEntry(titleId: titleID)
  }

  func load(item: MediaTitle, api: APIClient, isSignedIn: Bool) async {
    async let details: Void = loadDetails(item: item, api: api)
    async let shelf: Void = loadShelf(api: api, isSignedIn: isSignedIn)
    _ = await (details, shelf)
  }

  func loadCredits(page: Int, season: Int?, api: APIClient) async {
    isLoadingCredits = true
    defer { isLoadingCredits = false }
    var query = [URLQueryItem(name: "page", value: String(page))]
    if let season { query.append(URLQueryItem(name: "season", value: String(season))) }
    do {
      let response: CreditsResponse = try await api.get(
        "/api/catalog/titles/\(entry.titleId)/credits",
        query: query
      )
      credits = response
      rememberCreditSeasons(from: response)
    } catch {
      credits = .empty(page: page)
    }
  }

  func save(api: APIClient) async -> Bool {
    isSaving = true
    defer { isSaving = false }
    do {
      let response: EntryResponse = try await api.send("/api/profile", method: "POST", body: entry)
      if let saved = response.entry { entry = saved }
      hasExistingEntry = true
      message = "Saved to your shelf."
      return true
    } catch {
      message = error.localizedDescription
      return false
    }
  }

  func remove(api: APIClient) async -> Bool {
    isSaving = true
    defer { isSaving = false }
    do {
      try await api.send(
        "/api/profile/\(entry.titleId)", method: "DELETE", body: [String: String]())
      entry = ViewingEntry(titleId: entry.titleId)
      hasExistingEntry = false
      message = "Removed from your shelf."
      return true
    } catch {
      message = error.localizedDescription
      return false
    }
  }

  private func loadDetails(item: MediaTitle, api: APIClient) async {
    isLoadingDetails = true
    defer { isLoadingDetails = false }

    async let insightRequest: InsightResponse? = try? await api.get(
      "/api/curator/insight/\(item.id)")
    async let creditsRequest: CreditsResponse? = try? await api.get(
      "/api/catalog/titles/\(item.id)/credits",
      query: [URLQueryItem(name: "page", value: "1")]
    )
    async let recommendationRequest = recommendationItems(item: item, api: api)
    async let collectionRequest = collectionItems(item: item, api: api)
    async let availabilityRequest: TitleAvailabilityResponse? = try? await api.get(
      "/api/catalog/\(item.mediaType)/\(item.tmdbId)/availability")

    let (insightResponse, creditsResponse, recommended, collection, availability) = await (
      insightRequest, creditsRequest, recommendationRequest, collectionRequest, availabilityRequest
    )
    insight = insightResponse?.insight
    insightPairs = insightResponse?.pairs ?? []
    credits = creditsResponse ?? .empty()
    if let creditsResponse { rememberCreditSeasons(from: creditsResponse) }
    recommendations = recommended
    collectionItems = collection
    if let availability,
      !availability.providers.isEmpty || availability.nextEpisode != nil
    {
      availabilityProviders = availability.providers
      nextEpisode = availability.nextEpisode
    }
  }

  private func loadShelf(api: APIClient, isSignedIn: Bool) async {
    guard isSignedIn else {
      entry = ViewingEntry(titleId: entry.titleId)
      hasExistingEntry = false
      return
    }

    isLoading = true
    defer { isLoading = false }
    do {
      let response: EntryResponse = try await api.get("/api/profile/entry/\(entry.titleId)")
      entry = response.entry ?? ViewingEntry(titleId: entry.titleId)
      hasExistingEntry = response.entry != nil
    } catch {
      message = error.localizedDescription
    }
  }

  private func recommendationItems(item: MediaTitle, api: APIClient) async -> [MediaTitle] {
    let ids = (item.recommendationIds ?? []).filter { $0 != item.id }.prefix(12)
    guard !ids.isEmpty else { return [] }
    let response: TitleItemsResponse? = try? await api.get(
      "/api/catalog/items",
      query: [URLQueryItem(name: "ids", value: ids.joined(separator: ","))]
    )
    return response?.items ?? []
  }

  private func collectionItems(item: MediaTitle, api: APIClient) async -> [MediaTitle] {
    guard let collectionID = item.collection?.id else { return [] }
    let response: TitleCollectionResponse? = try? await api.get(
      "/api/catalog/collections/\(collectionID)")
    return response?.items ?? []
  }

  private func rememberCreditSeasons(from response: CreditsResponse) {
    guard !response.seasons.isEmpty else { return }
    creditSeasons = response.seasons
  }
}
