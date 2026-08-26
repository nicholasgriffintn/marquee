import Foundation

struct TitleRatingSummary {
  let sources: String
  let votes: String?
}

struct TitleConsensus {
  let score: Double
  let sourceCount: Int
}

func titleConsensus(_ item: MediaTitle) -> TitleConsensus? {
  var values: [(score: Double, weight: Double)] = []
  if let score = item.tmdbScore, item.tmdbVoteCount > 0 { values.append((score, 1)) }
  if let score = item.ratings?.imdbScore { values.append((score, 1.3)) }
  if let score = rottenTomatoesScore(item.ratings?.rottenTomatoes) {
    values.append((Double(score) / 10, 0.8))
  }
  if let score = item.ratings?.metascore { values.append((Double(score) / 10, 0.8)) }
  if let score = item.ratings?.animeScore { values.append((score, 0.8)) }
  guard values.count > 1 else { return nil }
  let totalWeight = values.reduce(0) { $0 + $1.weight }
  let score = values.reduce(0) { $0 + ($1.score * $1.weight) } / totalWeight
  return TitleConsensus(score: score, sourceCount: values.count)
}

func titleRatingSummary(_ item: MediaTitle, limit: Int = 3) -> TitleRatingSummary {
  var sources: [(label: String, display: String, outOfTen: Bool, votes: Int?)] = []

  if let score = item.tmdbScore, item.tmdbVoteCount > 0 {
    sources.append(("TMDB", String(format: "%.1f", score), true, item.tmdbVoteCount))
  }
  if let score = item.ratings?.imdbScore {
    sources.append(("IMDb", String(format: "%.1f", score), true, item.ratings?.imdbVotes))
  }
  if let score = rottenTomatoesScore(item.ratings?.rottenTomatoes) {
    sources.append(("Rotten Tomatoes", "\(score)%", false, nil))
  }
  if let score = item.ratings?.metascore {
    sources.append(("Metacritic", "\(score)", false, nil))
  }
  if let score = item.ratings?.animeScore {
    sources.append(
      ("MyAnimeList", String(format: "%.1f", score), true, item.ratings?.animeVotes))
  }

  let shown = Array(sources.prefix(limit))
  guard !shown.isEmpty else { return TitleRatingSummary(sources: "Not yet rated", votes: nil) }

  let line = shown.enumerated().map { index, source in
    "\(source.label) \(source.display)\(index == 0 && source.outOfTen ? " / 10" : "")"
  }.joined(separator: " · ")
  let votes = shown.first(where: { ($0.votes ?? 0) > 0 })?.votes.map {
    "\(compactStatisticCount($0)) votes"
  }

  return TitleRatingSummary(sources: line, votes: votes)
}

func compactStatisticCount(_ value: Int) -> String {
  if value >= 1_000_000 {
    return compactNumber(Double(value) / 1_000_000, dropsFractionAt: 10) + "m"
  }
  if value >= 1_000 {
    return compactNumber(Double(value) / 1_000, dropsFractionAt: 10) + "k"
  }
  return "\(value)"
}

func statisticChangeLabel(_ delta: Double) -> String {
  let percentage = Int((delta * 100).rounded())
  let value = percentage.formatted(.number.grouping(.automatic))
  return "\(percentage >= 0 ? "+" : "")\(value)%"
}

func moneyStatisticLabel(_ value: Int) -> String {
  let amount = Double(value)
  if value >= 1_000_000_000 {
    return String(format: "$%.1fbn", amount / 1_000_000_000)
  }
  if value >= 1_000_000 {
    return "$\(Int((amount / 1_000_000).rounded()))m"
  }
  return "$\(value.formatted())"
}

private func rottenTomatoesScore(_ value: String?) -> Int? {
  guard let value else { return nil }
  return Int(value.replacingOccurrences(of: "%", with: ""))
}

private func compactNumber(_ value: Double, dropsFractionAt threshold: Double) -> String {
  if value >= threshold { return String(format: "%.0f", value) }
  return String(format: "%.1f", value)
}
