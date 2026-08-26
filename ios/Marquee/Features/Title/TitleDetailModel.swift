import Foundation

@MainActor
final class TitleDetailModel: ObservableObject {
  @Published var entry: ViewingEntry
  @Published private(set) var isLoading = false
  @Published private(set) var isSaving = false
  @Published private(set) var hasExistingEntry = false
  @Published var message = ""

  init(titleID: String) {
    entry = ViewingEntry(titleId: titleID)
  }

  func load(api: APIClient, isSignedIn: Bool) async {
    guard isSignedIn else { return }
    isLoading = true
    do {
      let response: EntryResponse = try await api.get("/api/profile/entry/\(entry.titleId)")
      entry = response.entry ?? ViewingEntry(titleId: entry.titleId)
      hasExistingEntry = response.entry != nil
    } catch {
      message = error.localizedDescription
    }
    isLoading = false
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
}
