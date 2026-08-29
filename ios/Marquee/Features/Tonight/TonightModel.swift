import Foundation

@MainActor
final class TonightModel: ObservableObject {
  @Published private(set) var featured: MediaTitle?
  @Published private(set) var sections: [CatalogSection] = []
  @Published private(set) var episodes: [ScheduledEpisode] = []
  @Published private(set) var trending: [MediaTitle] = []
  @Published private(set) var providers: [MarqueeProvider] = []
  @Published private(set) var curated: [MediaTitle] = []
  @Published private(set) var curatorPrompt = ""
  @Published private(set) var curatorStatus = ""
  @Published private(set) var curatorSummary = ""
  @Published private(set) var usherError = ""
  @Published private(set) var pick: UsherPickResponse?
  @Published private(set) var isLoading = true
  @Published private(set) var isAsking = false
  @Published private(set) var isPicking = false
  @Published var error = ""

  var isUsherActive: Bool {
    isAsking || isPicking || !curatorPrompt.isEmpty || pick != nil || !usherError.isEmpty
  }

  func load(api: APIClient, providerIDs: [String], isSignedIn: Bool) async {
    isLoading = true
    error = ""
    featured = nil

    do {
      let providerQuery =
        providerIDs.isEmpty
        ? [] : [URLQueryItem(name: "providers", value: providerIDs.joined(separator: ","))]
      async let catalogue: CatalogResponse = api.get(
        "/api/catalog",
        query: providerQuery
      )
      async let feature: FeaturedTitleResponse? = try? api.get(
        "/api/catalog/featured",
        query: providerQuery
      )
      async let schedule: TonightResponse = api.get(
        "/api/catalog/tonight",
        query: [URLQueryItem(name: "limit", value: "12")]
      )
      async let trend: TrendingResponse = api.get("/api/catalog/trending")
      async let providerList: ProvidersResponse = api.get("/api/catalog/providers")

      let (catalogueValue, featureValue, scheduleValue, trendValue, providerValue) = try await (
        catalogue, feature, schedule, trend, providerList
      )
      var allSections = catalogueValue.sections

      if isSignedIn, let personal: RailsResponse = try? await api.get("/api/catalog/rails") {
        allSections =
          personal.sections
          + allSections.filter { section in
            !personal.sections.contains(where: { $0.id == section.id })
          }
      }

      sections = allSections
      featured = featureValue?.item ?? allSections.first?.items.first
      episodes = scheduleValue.episodes
      trending = trendValue.items
      providers = providerValue.providers
    } catch {
      self.error = error.localizedDescription
    }

    isLoading = false
  }

  func ask(
    _ prompt: String,
    api: APIClient,
    providerIDs: [String],
    isRefinement: Bool = false
  ) async {
    let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    isAsking = true
    pick = nil
    curatorPrompt = trimmed
    curatorStatus = "Thinking"
    curatorSummary = ""
    usherError = ""

    if !isRefinement {
      curated = []
    }

    do {
      let calendar = Calendar.current
      let data = try await api.data(
        "/api/curator",
        method: "POST",
        body: CuratorRequest(
          prompt: trimmed,
          providerIds: providerIDs,
          hour: calendar.component(.hour, from: Date()),
          isWeekend: calendar.isDateInWeekend(Date())
        )
      )
      applyCuratorStream(data)
    } catch {
      usherError = error.localizedDescription
      curatorStatus = ""
    }

    isAsking = false
  }

  func askForPick(api: APIClient, providerIDs: [String]) async {
    isPicking = true
    pick = nil
    curatorPrompt = ""
    curatorStatus = ""
    curatorSummary = ""
    curated = []
    usherError = ""

    do {
      let calendar = Calendar.current
      let response: UsherPickResponse = try await api.send(
        "/api/usher/pick",
        method: "POST",
        body: UsherPickRequest(
          providerIds: providerIDs,
          rejected: [],
          hour: calendar.component(.hour, from: Date()),
          isWeekend: calendar.isDateInWeekend(Date())
        )
      )
      pick = response

      if let picked = response.item {
        Telemetry.shared.remember([picked.id], token: response.journey)
      }
    } catch {
      usherError = error.localizedDescription
    }

    isPicking = false
  }

  func clearUsher() {
    curatorPrompt = ""
    curatorStatus = ""
    curatorSummary = ""
    curated = []
    pick = nil
    usherError = ""
  }

  private func applyCuratorStream(_ data: Data) {
    guard let stream = String(data: data, encoding: .utf8) else { return }

    for chunk in stream.components(separatedBy: "\n\n") {
      guard
        let line = chunk.components(separatedBy: .newlines).first(where: { $0.hasPrefix("data:") }),
        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces).data(using: .utf8),
        let event = try? JSONDecoder().decode(CuratorEvent.self, from: payload)
      else { continue }

      if event.type == "status", let label = event.label { curatorStatus = label }
      if let items = event.items {
        curated = items
        curatorStatus = ""
      }
      if let text = event.text { curatorSummary += text }
      if let summary = event.summary {
        curatorSummary = summary
        curatorStatus = ""
      }
      if let message = event.message {
        usherError = message
        curatorStatus = ""
      }
    }
  }
}
