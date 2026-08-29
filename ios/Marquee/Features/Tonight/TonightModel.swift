import Foundation

@MainActor
final class TonightModel: ObservableObject {
  private static let railRetryDelaySeconds = [5, 10, 20, 30]

  @Published private(set) var featured: MediaTitle?
  @Published private(set) var sections: [CatalogSection] = []
  @Published private(set) var rails: [CatalogSection] = []
  @Published private(set) var railVerdicts: [String: String] = [:]
  @Published private(set) var isBuildingRails = false
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

  func load(api: APIClient, providerIDs: [String]) async {
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
      sections = catalogueValue.sections
      featured = featureValue?.item ?? rails.first?.items.first ?? sections.first?.items.first
      episodes = scheduleValue.episodes
      trending = trendValue.items
      providers = providerValue.providers
    } catch {
      self.error = error.localizedDescription
    }

    isLoading = false
  }

  func loadRails(api: APIClient, isSignedIn: Bool, retrying: Bool = true) async {
    guard isSignedIn else {
      rails = []
      isBuildingRails = false
      return
    }

    let retries = retrying ? Self.railRetryDelaySeconds.count : 0

    for attempt in 0...retries {
      guard
        let delivery: RailsDelivery = try? await api.get(
          "/api/catalog/rails",
          query: [URLQueryItem(name: "generate", value: "1")]
        )
      else {
        isBuildingRails = false
        return
      }

      rails = delivery.rails
      isBuildingRails = delivery.isBuilding

      guard delivery.isBuilding, attempt < retries else { return }

      try? await Task.sleep(for: .seconds(Self.railRetryDelaySeconds[attempt]))

      if Task.isCancelled { return }
    }
  }

  func recordRailVerdict(_ railId: String, verdict: String, api: APIClient) async {
    railVerdicts[railId] = verdict

    do {
      _ = try await api.data(
        "/api/usher/feedback",
        method: "POST",
        body: RailFeedbackRequest(railId: railId, verdict: verdict)
      )
    } catch {
      railVerdicts[railId] = nil
    }
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
