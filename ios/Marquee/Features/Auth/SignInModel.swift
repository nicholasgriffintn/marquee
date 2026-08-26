import Foundation

@MainActor
final class SignInModel: ObservableObject {
  @Published private(set) var isLoading = true
  @Published private(set) var github: AuthMethodProvider?
  @Published private(set) var error = ""

  func load(api: APIClient) async {
    isLoading = true
    error = ""

    do {
      let methods: AuthMethodsResponse = try await api.get("/api/auth/methods")
      github = methods.providers.first(where: { $0.id == "github" })

      if github == nil {
        error = "The window is shut. No supported sign-in method is configured on this deployment."
      }
    } catch {
      self.error = error.localizedDescription
    }

    isLoading = false
  }
}
