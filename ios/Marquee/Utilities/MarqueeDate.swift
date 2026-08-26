import Foundation

enum MarqueeDate {
  static func parse(_ value: String) -> Date? {
    let normalized =
      value.contains("T") ? value : "\(value.replacingOccurrences(of: " ", with: "T"))Z"
    return try? Date(normalized, strategy: .iso8601)
  }
}
