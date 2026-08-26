import CryptoKit
import Foundation
import Security

struct NativeAuthenticationProof {
  let verifier: String
  let challenge: String

  static func make() throws -> NativeAuthenticationProof {
    var bytes = [UInt8](repeating: 0, count: 32)

    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      throw APIError.invalidResponse
    }

    let verifier = bytes.map { String(format: "%02x", $0) }.joined()
    let challenge = SHA256.hash(data: Data(verifier.utf8)).map {
      String(format: "%02x", $0)
    }.joined()

    return NativeAuthenticationProof(verifier: verifier, challenge: challenge)
  }
}
