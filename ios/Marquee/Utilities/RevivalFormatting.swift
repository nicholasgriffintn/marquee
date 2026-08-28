import Foundation

func revivalWorkMeta(_ work: RevivalCard) -> String {
  revivalJoinedMeta(
    year: work.year,
    country: work.country,
    kind: work.kind,
    runtimeSeconds: work.runtimeSeconds,
    director: work.director
  )
}

func revivalWorkMeta(_ work: RevivalWork) -> String {
  revivalJoinedMeta(
    year: work.year,
    country: work.country,
    kind: work.kind,
    runtimeSeconds: work.runtimeSeconds,
    director: work.director
  )
}

func revivalRuntime(_ seconds: Int?) -> String {
  guard let seconds, seconds > 0 else { return "" }
  let minutes = Int((Double(seconds) / 60).rounded())
  guard minutes >= 60 else { return "\(minutes) min" }
  return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m"
}

func revivalPrintMeta(_ print: RevivalPrint) -> String {
  let megabytes = print.streamBytes.map { Int((Double($0) / 1_048_576).rounded()) }
  return [
    print.mirrored ? "Our print" : revivalSourceLabel(print.source),
    revivalRuntime(print.runtimeSeconds),
    print.height.map { "\($0)p" },
    megabytes.map { "\($0) MB" },
    print.condition == "rough" ? "rough print" : nil,
  ]
  .compactMap { $0 }
  .filter { !$0.isEmpty }
  .joined(separator: " · ")
}

func revivalCondition(_ condition: String) -> (label: String, note: String) {
  switch condition {
  case "pristine":
    ("Clean print", "A clean print. Somebody looked after this one.")
  case "watchable":
    ("Worn print", "The print has seen a few decades. It holds up.")
  case "rough":
    ("Rough print", "Rough print. Grain, wobble, and a soundtrack doing its best.")
  default:
    ("Unseen print", "I have not had a proper look at this print yet.")
  }
}

func revivalRightsSummary(_ work: RevivalWork) -> String {
  if work.rightsBasis == "uk-expired", let expires = work.ukExpiresYear {
    return "UK copyright expired in \(expires - 1)"
  }
  if work.rightsBasis == "eu-institution" || work.rightsBasis == "cc0" {
    return "Released as public domain by \(revivalSourceLabel(work.source))"
  }
  if work.rightsBasis == "us-gov" || work.rightsBasis == "curated" {
    return "\(revivalSourceLabel(work.source)) offers this as free to use"
  }
  if work.rightsBasis == "unclear" {
    return "No public domain claim on the source record"
  }
  return "Source record marks this copy as public domain"
}

func revivalUKStanding(_ work: RevivalWork) -> String {
  if work.ukClear, let expires = work.ukExpiresYear {
    return "Out of UK copyright since \(expires)"
  }
  if let expires = work.ukExpiresYear {
    return "UK term runs to \(expires) on the dates we could find"
  }
  return "UK term not established"
}

func revivalDeliveryNote(_ work: RevivalWork) -> String {
  if work.delivery == "source" {
    return "Hosted by \(revivalSourceLabel(work.source))"
  }
  return work.mirrored
    ? "Hosted here, copied from \(revivalSourceLabel(work.source))"
    : "Hosted by \(revivalSourceLabel(work.source)), relayed through us"
}

func revivalSourceLabel(_ source: String) -> String {
  switch source {
  case "loc": "Library of Congress"
  case "europeana": "Europeana"
  case "wikidata": "Wikimedia Commons"
  default: "Internet Archive"
  }
}

enum WikipediaTextLicence {
  static let name = "CC BY-SA 4.0"
  static let url = URL(string: "https://creativecommons.org/licenses/by-sa/4.0/")
}

func revivalClockLabel(_ seconds: Int) -> String {
  let whole = max(0, seconds)
  let minutes = String(format: "%02d", (whole / 60) % 60)
  let remainder = String(format: "%02d", whole % 60)
  let hours = whole / 3_600
  return hours > 0 ? "\(hours):\(minutes):\(remainder)" : "\(minutes):\(remainder)"
}

private func revivalJoinedMeta(
  year: Int?, country: String?, kind: String, runtimeSeconds: Int?, director: String?
) -> String {
  [
    year.map(String.init),
    country,
    kind == "short" ? "Short" : kind == "ephemeral" ? "Ephemeral" : nil,
    revivalRuntime(runtimeSeconds),
    director,
  ]
  .compactMap { $0 }
  .filter { !$0.isEmpty }
  .joined(separator: " · ")
}
