import Foundation

enum MarqueeDate {
  static func parse(_ value: String) -> Date? {
    if value.count == 10 {
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = [.withFullDate]
      return formatter.date(from: value)
    }
    let normalized =
      value.contains("T") ? value : "\(value.replacingOccurrences(of: " ", with: "T"))Z"
    return try? Date(normalized, strategy: .iso8601)
  }

  static func titleDate(_ value: String, includesWeekday: Bool, includesYear: Bool) -> String {
    guard let date = parse(value) else { return value }
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.setLocalizedDateFormatFromTemplate(
      (includesWeekday ? "EEEE" : "") + "dMMMM" + (includesYear ? "yyyy" : ""))
    return formatter.string(from: date)
  }

  static func shortDate(_ value: String) -> String {
    guard let date = parse(value) else { return value }
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.setLocalizedDateFormatFromTemplate("dMMM")
    return formatter.string(from: date)
  }

  static func dateTime(_ value: String) -> String {
    guard let date = parse(value) else { return value }
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.setLocalizedDateFormatFromTemplate("E d MMM HH:mm")
    return formatter.string(from: date)
  }
}
