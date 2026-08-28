import Foundation

func sentenceList(_ values: [String]) -> String {
  guard values.count > 1 else { return values.first ?? "" }
  return values.dropLast().joined(separator: ", ") + " and " + (values.last ?? "")
}

func sourceWorkMeta(_ source: SourceWork) -> String {
  let provenance = [source.workType, source.publishedYear.map(String.init)]
    .compactMap { $0 }
    .filter { !$0.isEmpty }
    .joined(separator: ", ")

  return [
    "Adapted from \(source.label)",
    source.authors.joined(separator: ", "),
    provenance,
  ]
  .filter { !$0.isEmpty }
  .joined(separator: " · ")
}

func awardTally(_ awards: AwardSummary) -> String {
  [
    awards.wins > 0 ? "\(awards.wins) win\(awards.wins == 1 ? "" : "s")" : "",
    awards.nominations > 0
      ? "\(awards.nominations) nomination\(awards.nominations == 1 ? "" : "s")" : "",
  ]
  .filter { !$0.isEmpty }
  .joined(separator: " · ")
}

func awardLine(_ entry: AwardEntry) -> String {
  entry.ceremonyYear.map { "\(entry.label) (\($0))" } ?? entry.label
}

func titleVisualFormatLabel(_ format: TitleVisualFormat) -> String {
  [format.colours.joined(separator: " and "), format.aspectRatios.joined(separator: " and ")]
    .filter { !$0.isEmpty }
    .joined(separator: " · ")
}

struct TitleIdentifierLink: Identifiable {
  var id: String { label }
  let label: String
  let url: URL
}

func titleIdentifierLinks(_ ids: TitleExternalIds?) -> [TitleIdentifierLink] {
  guard let ids else { return [] }
  return [
    ("Letterboxd", ids.letterboxdId.map { "https://letterboxd.com/film/\($0)/" }),
    ("Rotten Tomatoes", ids.rottenTomatoesId.map { "https://www.rottentomatoes.com/\($0)" }),
    ("Metacritic", ids.metacriticId.map { "https://www.metacritic.com/\($0)" }),
    ("Trakt", ids.traktId.map { "https://trakt.tv/\($0)" }),
  ]
  .compactMap { label, address in
    guard let address, let url = URL(string: address) else { return nil }
    return TitleIdentifierLink(label: label, url: url)
  }
}
