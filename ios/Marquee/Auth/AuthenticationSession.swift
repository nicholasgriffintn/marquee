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

        guard
          let components = url.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) })
        else {
          continuation.resume(throwing: APIError.invalidResponse)
          return
        }

        if let errorCode = components.queryItems?.first(where: { $0.name == "error" })?.value {
          continuation.resume(
            throwing: APIError.server(status: 401, message: Self.message(for: errorCode)))
          return
        }

        guard let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
          continuation.resume(throwing: APIError.invalidResponse)
          return
        }

        continuation.resume(returning: code)
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

  private static func message(for code: String) -> String {
    switch code {
    case "invalid_callback": "That ticket does not match the stub. Start again."
    case "provider_not_found": "GitHub sign-in is not available here."
    case "identity_conflict": "That seat belongs to another sign-in."
    default: "Sign-in did not complete. Try again."
    }
  }
}
