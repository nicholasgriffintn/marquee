import Foundation
import Security

enum KeychainStore {
  private static let service = "app.pashi.marquee"
  private static let account = "api-token"

  static func saveToken(_ token: String) throws {
    let data = Data(token.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    SecItemDelete(query as CFDictionary)
    var values = query
    values[kSecValueData as String] = data
    values[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    guard SecItemAdd(values as CFDictionary, nil) == errSecSuccess else {
      throw APIError.invalidResponse
    }
  }

  static func readToken() throws -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &value)

    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = value as? Data else { throw APIError.invalidResponse }
    return String(data: data, encoding: .utf8)
  }

  static func removeToken() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
