import Foundation
import Security

enum KeychainStore {
  private static let service = "app.pashi.marquee"
  private static let tokenAccount = "api-token"
  private static let magicLinkVerifierAccount = "magic-link-verifier"

  static func saveToken(_ token: String) throws {
    try save(token, account: tokenAccount)
  }

  static func readToken() throws -> String? {
    try read(account: tokenAccount)
  }

  static func removeToken() {
    remove(account: tokenAccount)
  }

  static func saveMagicLinkVerifier(_ verifier: String) throws {
    try save(verifier, account: magicLinkVerifierAccount)
  }

  static func readMagicLinkVerifier() throws -> String? {
    try read(account: magicLinkVerifierAccount)
  }

  static func removeMagicLinkVerifier() {
    remove(account: magicLinkVerifierAccount)
  }

  private static func save(_ value: String, account: String) throws {
    let query = query(account: account)

    SecItemDelete(query as CFDictionary)
    var values = query
    values[kSecValueData as String] = Data(value.utf8)
    values[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    guard SecItemAdd(values as CFDictionary, nil) == errSecSuccess else {
      throw APIError.invalidResponse
    }
  }

  private static func read(account: String) throws -> String? {
    var query = query(account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &value)

    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = value as? Data else {
      throw APIError.invalidResponse
    }
    return String(data: data, encoding: .utf8)
  }

  private static func remove(account: String) {
    SecItemDelete(query(account: account) as CFDictionary)
  }

  private static func query(account: String) -> [String: Any] {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    return query
  }
}
