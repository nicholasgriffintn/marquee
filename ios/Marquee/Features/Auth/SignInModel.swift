import Foundation

@MainActor
final class SignInModel: ObservableObject {
  @Published private(set) var isLoading = true
  @Published private(set) var isRequestingMagicLink = false
  @Published private(set) var providers: [AuthMethodProvider] = []
  @Published private(set) var magicLink = false
  @Published private(set) var magicLinkMessage = ""
  @Published var email = ""
  @Published private(set) var error = ""

  func load(api: APIClient) async {
    isLoading = true
    error = ""

    do {
      let methods: AuthMethodsResponse = try await api.get("/api/auth/methods")
      providers = methods.providers.filter { $0.id == "github" || $0.id == "google" }
      magicLink = methods.magicLink

      if providers.isEmpty && !magicLink {
        error = "The window is shut. No supported sign-in method is configured on this deployment."
      }
    } catch {
      self.error = error.localizedDescription
    }

    isLoading = false
  }

  func requestMagicLink(api: APIClient) async {
    guard !isRequestingMagicLink else { return }

    let address = email.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !address.isEmpty else {
      error = "Email is required."
      return
    }

    isRequestingMagicLink = true
    defer { isRequestingMagicLink = false }
    error = ""
    magicLinkMessage = ""

    do {
      let proof = try NativeAuthenticationProof.make()
      try KeychainStore.saveMagicLinkVerifier(proof.verifier)
      let response: AuthActionResponse = try await api.send(
        "/api/auth",
        method: "POST",
        body: NativeMagicLinkRequest(email: address, challenge: proof.challenge)
      )
      magicLinkMessage = response.message
    } catch {
      self.error = error.localizedDescription
    }
  }
}

private struct NativeMagicLinkRequest: Encodable {
  let action = "request_native_magic_link"
  let values: Values

  init(email: String, challenge: String) {
    values = Values(email: email, challenge: challenge)
  }

  struct Values: Encodable {
    let email: String
    let challenge: String
  }
}

private struct AuthActionResponse: Decodable {
  let message: String
}
