import AuthenticationServices
import Foundation

@MainActor
final class AppState: ObservableObject {
  @Published private(set) var user: MarqueeUser?
  @Published private(set) var isRestoring = true
  @Published private(set) var isSigningIn = false
  @Published var isPresentingSignIn = false
  @Published var authenticationError = ""
  @Published var selectedProviderIDs: Set<String> = []
  @Published var catalogueSearchQuery = ""
  @Published private(set) var shelfVersion = 0

  let api = APIClient(baseURL: AppConfiguration.baseURL)
  private let authentication = AuthenticationSession()

  var isSignedIn: Bool { user != nil }

  func requireSignIn() {
    authenticationError = ""
    isPresentingSignIn = true
  }

  func dismissSignIn() {
    guard !isSigningIn else { return }
    isPresentingSignIn = false
  }

  func restore() async {
    defer { isRestoring = false }

    guard (try? KeychainStore.readToken()) != nil else {
      await loadProviderPreferences()
      return
    }

    do {
      let response: SessionResponse = try await api.get("/api/auth/session")
      user = response.user
      if user == nil { KeychainStore.removeToken() }
      await loadProviderPreferences()
    } catch {
      KeychainStore.removeToken()
      authenticationError = "Your ticket had expired. Sign in again."
    }
  }

  func signIn() async {
    guard !isSigningIn else { return }

    isSigningIn = true
    defer { isSigningIn = false }
    authenticationError = ""
    let guestProviderIDs = selectedProviderIDs

    do {
      let start = AppConfiguration.baseURL.appending(path: "/api/auth/native/github")
      let code = try await authentication.authenticate(at: start)
      let response: NativeTokenResponse = try await api.send(
        "/api/auth/native/exchange",
        method: "POST",
        body: ["code": code]
      )

      try KeychainStore.saveToken(response.token)
      let session: SessionResponse = try await api.get("/api/auth/session")
      user = session.user
      await loadProviderPreferences(migrating: guestProviderIDs)
      isPresentingSignIn = false
    } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
      return
    } catch {
      authenticationError = error.localizedDescription
    }
  }

  func signOut() async {
    do {
      try await api.send("/api/auth/logout", method: "POST", body: [String: String]())
    } catch {
      // Local removal still signs this device out if the network is unavailable.
    }

    KeychainStore.removeToken()
    user = nil
    selectedProviderIDs = Set(
      UserDefaults.standard.stringArray(forKey: "selectedProviderIds") ?? [])
  }

  func saveProviders(_ ids: Set<String>) async {
    selectedProviderIDs = ids
    let values = ids.sorted()

    if isSignedIn {
      do {
        let _: ProviderPreferences = try await api.send(
          "/api/profile/providers",
          method: "POST",
          body: ["selectedProviderIds": values]
        )
      } catch {
        authenticationError = "Could not save your services."
      }
    } else {
      UserDefaults.standard.set(values, forKey: "selectedProviderIds")
    }
  }

  func shelfDidChange() { shelfVersion += 1 }

  private func loadProviderPreferences(migrating guestIDs: Set<String> = []) async {
    if isSignedIn {
      if let preferences: ProviderPreferences = try? await api.get("/api/profile/providers") {
        if !preferences.isSaved, !guestIDs.isEmpty {
          await saveProviders(guestIDs)
        } else {
          selectedProviderIDs = Set(preferences.selectedProviderIds)
        }
      }
    } else {
      selectedProviderIDs = Set(
        UserDefaults.standard.stringArray(forKey: "selectedProviderIds") ?? [])
    }
  }
}
