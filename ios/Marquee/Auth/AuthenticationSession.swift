import AuthenticationServices
import UIKit

@MainActor
final class AuthenticationSession: NSObject, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?

  func authenticate(at url: URL) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "marquee") {
        url, error in
        self.session = nil

        if let error {
          continuation.resume(throwing: error)
          return
        }

        guard let url else {
          continuation.resume(throwing: APIError.invalidResponse)
          return
        }

        do {
          continuation.resume(returning: try NativeAuthenticationCallback.code(from: url))
        } catch {
          continuation.resume(throwing: error)
        }
      }

      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      self.session = session

      guard session.start() else {
        self.session = nil
        continuation.resume(throwing: APIError.invalidResponse)
        return
      }
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
  }
}
