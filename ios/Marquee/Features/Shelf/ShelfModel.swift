import Foundation

@MainActor
final class ShelfModel: ObservableObject {
  enum Sort: String, CaseIterable, Identifiable {
    case added
    case rating
    case status
    case year
    case genre

    var id: String { rawValue }
    var label: String {
      switch self {
      case .added: "Recently added"
      case .rating: "Your rating"
      case .status: "Status"
      case .year: "Year"
      case .genre: "Genre"
      }
    }
  }

  @Published var query = ""
  @Published var status: EntryStatus?
  @Published var genre = ""
  @Published var sort = Sort.added
  @Published private(set) var items: [ShelfItem] = []
  @Published private(set) var genres: [String] = []
  @Published private(set) var shelved = 0
  @Published private(set) var hasMore = false
  @Published private(set) var isLoading = false
  @Published private(set) var error = ""
  private var page = 0

  var filterKey: String { "\(query)|\(status?.rawValue ?? "")|\(genre)|\(sort.rawValue)" }

  func reload(api: APIClient) async {
    page = 0
    await load(api: api, appending: false)
  }

  func loadMore(api: APIClient) async {
    guard hasMore, !isLoading else { return }
    page += 1
    await load(api: api, appending: true)
  }

  private func load(api: APIClient, appending: Bool) async {
    isLoading = true
    error = ""
    var queryItems = [
      URLQueryItem(name: "sort", value: sort.rawValue),
      URLQueryItem(name: "page", value: String(page)),
    ]
    if !query.isEmpty { queryItems.append(URLQueryItem(name: "q", value: query)) }
    if let status { queryItems.append(URLQueryItem(name: "status", value: status.rawValue)) }
    if !genre.isEmpty { queryItems.append(URLQueryItem(name: "genre", value: genre)) }

    do {
      let response: ShelfResponse = try await api.get("/api/profile/shelf", query: queryItems)
      items = appending ? items + response.items : response.items
      genres = response.genres
      shelved = response.shelved
      hasMore = response.hasMore
    } catch {
      self.error = error.localizedDescription
      if !appending { items = [] }
    }
    isLoading = false
  }
}
