import Foundation

@MainActor
final class ListingsModel: ObservableObject {
  enum Sort: String, CaseIterable, Identifiable {
    case popularity
    case trending
    case score
    case recent

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
  }

  @Published var query = ""
  @Published var mediaType = ""
  @Published var sort = Sort.popularity
  @Published private(set) var items: [MediaTitle] = []
  @Published private(set) var hasMore = false
  @Published private(set) var isLoading = false
  @Published private(set) var error = ""
  private var page = 0

  var filterKey: String { "\(query)|\(mediaType)|\(sort.rawValue)" }

  func reload(api: APIClient, providerIDs: [String]) async {
    do {
      try await Task.sleep(for: .milliseconds(220))
      try Task.checkCancellation()
    } catch { return }

    page = 0
    await load(api: api, providerIDs: providerIDs, appending: false)
  }

  func loadMore(api: APIClient, providerIDs: [String]) async {
    guard hasMore, !isLoading else { return }
    page += 1
    await load(api: api, providerIDs: providerIDs, appending: true)
  }

  private func load(api: APIClient, providerIDs: [String], appending: Bool) async {
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
    if !providerIDs.isEmpty {
      queryItems.append(URLQueryItem(name: "providers", value: providerIDs.joined(separator: ",")))
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
}
