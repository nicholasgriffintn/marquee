import Foundation

@MainActor
final class DigestModel: ObservableObject {
  @Published private(set) var digest: Digest?
  @Published private(set) var isLoading = true
  @Published private(set) var error = ""

  func load(api: APIClient) async {
    isLoading = true
    do {
      let response: DigestResponse = try await api.get("/api/curator/digest")
      digest = response.digest
      error = ""
    } catch {
      self.error = error.localizedDescription
    }
    isLoading = false
  }
}
