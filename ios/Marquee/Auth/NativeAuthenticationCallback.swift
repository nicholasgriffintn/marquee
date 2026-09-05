import Foundation

enum NativeAuthenticationCallback {
  static func matches(_ url: URL) -> Bool {
    url.scheme == "marquee" && url.host == "auth" && url.path == "/callback"
  }

  static func code(from url: URL) throws -> String {
    guard matches(url),
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else {
      throw APIError.invalidResponse
    }

    if let errorCode = components.queryItems?.first(where: { $0.name == "error" })?.value {
      throw APIError.server(status: 401, message: message(for: errorCode))
    }

    guard let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
      code.hasPrefix("mqc_"),
      code.count <= 200
    else {
      throw APIError.invalidResponse
    }

    return code
  }

  private static func message(for code: String) -> String {
    switch code {
    case "invalid_callback": "That ticket does not match the stub. Start again."
    case "provider_not_found": "That sign-in method is not available here."
    case "identity_conflict": "That seat belongs to another sign-in."
    default: "Sign-in did not complete. Try again."
    }
  }
}
