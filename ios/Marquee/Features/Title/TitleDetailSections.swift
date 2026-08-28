import SwiftUI

struct TitleInsightView: View {
  let insight: TitleInsight?
  let isLoading: Bool

  var body: some View {
    if insight != nil || isLoading {
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 8) {
          Text("AI")
            .font(MarqueeTheme.mono(8, weight: .heavy))
            .foregroundStyle(MarqueeTheme.white)
            .padding(5)
            .background(MarqueeTheme.blue)
          Text("MARQUEE READ")
            .font(MarqueeTheme.mono(9, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(MarqueeTheme.mutedOnPaper)
        }
        if let insight {
          Text(insight.hook)
            .font(MarqueeTheme.serif(18, weight: .semibold))
            .foregroundStyle(MarqueeTheme.ink)
          if !insight.moods.isEmpty {
            FlowLayout(spacing: 7) {
              ForEach(insight.moods, id: \.self) { mood in
                Text(mood.uppercased())
                  .font(MarqueeTheme.mono(8, weight: .bold))
                  .foregroundStyle(MarqueeTheme.blue)
                  .padding(.horizontal, 9)
                  .padding(.vertical, 6)
                  .overlay { Rectangle().stroke(MarqueeTheme.blue) }
              }
            }
          }
        } else {
          ProgressView().tint(MarqueeTheme.blue)
        }
      }
      .padding(.leading, 14)
      .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.blue).frame(width: 3) }
    }
  }
}

struct TitleScoreView: View {
  let item: MediaTitle

  var body: some View {
    if !scores.isEmpty || item.ratings?.awards != nil {
      VStack(alignment: .leading, spacing: 14) {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 1) {
          ForEach(scores, id: \.label) { score in
            VStack(alignment: .leading, spacing: 3) {
              Text(score.value)
                .font(MarqueeTheme.sans(30, weight: .heavy))
                .tracking(-1)
                .foregroundStyle(MarqueeTheme.blue)
              Text(score.label.uppercased())
                .font(MarqueeTheme.mono(8, weight: .bold))
                .foregroundStyle(MarqueeTheme.mutedOnPaper)
                .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 80, alignment: .leading)
            .padding(16)
            .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
          }
        }
        if let awards = item.ratings?.awards, !awards.isEmpty {
          VStack(alignment: .leading, spacing: 5) {
            TitleDetailSectionLabel("AWARDS")
            Text(awards + awardWins)
              .font(MarqueeTheme.sans(12))
              .foregroundStyle(MarqueeTheme.mutedOnPaper)
          }
          .padding(.leading, 12)
          .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.acid).frame(width: 2) }
        }
      }
      .foregroundStyle(MarqueeTheme.ink)
    }
  }

  private let columns = [GridItem(.flexible()), GridItem(.flexible())]

  private var scores: [(value: String, label: String)] {
    var scores: [(String, String)] = []
    if let consensus = titleConsensus(item) {
      scores.append(
        (
          String(format: "%.1f", consensus.score),
          "Marquee consensus · \(consensus.sourceCount) sources"
        ))
    }
    if let value = item.tmdbScore {
      scores.append((String(format: "%.1f / 10", value), "TMDB user score"))
    } else {
      scores.append(("Not yet rated", "TMDB user score"))
    }
    scores.append((item.tmdbVoteCount.formatted(), "TMDB votes"))
    if let value = item.ratings?.imdbScore {
      let votes = item.ratings?.imdbVotes.map { " · \(compactStatisticCount($0)) votes" } ?? ""
      scores.append((String(format: "%.1f", value), "IMDb\(votes)"))
    }
    if let value = item.ratings?.rottenTomatoes {
      scores.append((value, "Rotten Tomatoes"))
    }
    if let value = item.ratings?.metascore {
      scores.append((String(value), "Metascore"))
    }
    if let value = item.ratings?.animeScore {
      scores.append((String(format: "%.1f", value), "MyAnimeList"))
    }
    if let value = item.ratings?.boxOffice, value > 0 {
      scores.append((moneyStatisticLabel(value), "Box office"))
    } else if let value = item.revenue, value > 0 {
      scores.append((moneyStatisticLabel(value), "Worldwide gross"))
    }
    return scores
  }

  private var awardWins: String {
    guard let wins = item.ratings?.awardWins, wins > 0 else { return "" }
    return " · \(wins) win\(wins == 1 ? "" : "s")"
  }
}

struct TitleBuzzView: View {
  let buzz: TitleBuzz
  @Binding var pendingDestination: ExternalDestination?

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      TitleDetailSectionLabel("TRENDING SIGNAL")
      (Text(buzz.views.formatted()).font(MarqueeTheme.sans(18, weight: .heavy))
        + Text(
          " Wikipedia readers in the last 7 days, \(statisticChangeLabel(buzz.delta)) on the \(buzz.previousViews.formatted()) the week before."
        ).font(MarqueeTheme.sans(14)))
      if let article = buzz.article, let url = buzz.articleUrl {
        FlowLayout(spacing: 4) {
          Text("Article")
          ExternalLinkButton(
            pendingDestination: $pendingDestination,
            destination: ExternalDestination(url: url, label: article, kind: .wikipedia)
          ) {
            Text(article)
              .underline()
              .foregroundStyle(MarqueeTheme.blue)
          }
          Text(buzzDetail)
        }
        .font(MarqueeTheme.mono(10))
        .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
    }
    .foregroundStyle(MarqueeTheme.ink)
    .padding(.leading, 15)
    .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.acid).frame(width: 3) }
  }

  private var buzzDetail: String {
    let match = buzz.match == "wikidata" ? "Wikidata IMDb link" : "title search"
    return "· matched by \(match)"
      + (buzz.measuredAt.map { " · measured \(MarqueeDate.shortDate($0))" } ?? "")
  }
}

struct TitleAirStatusView: View {
  let item: MediaTitle
  let nextEpisode: TitleNextEpisode?

  var body: some View {
    if let nextEpisode {
      airLine(
        label: "Next episode",
        detail: nextEpisodeDetail(nextEpisode),
        credit: "Schedule from TVmaze"
      )
    } else if let date = item.nextAirDate ?? item.lastAirDate {
      VStack(alignment: .leading, spacing: 4) {
        (Text(item.nextAirDate == nil ? "LAST SHOWN " : "NEXT EPISODE ")
          .font(MarqueeTheme.mono(10, weight: .bold))
          .foregroundStyle(MarqueeTheme.blue)
          + Text(formattedDate(date) + statusSuffix).font(MarqueeTheme.sans(13)))
        if item.nextAirDate != nil {
          Text("Schedule from TVmaze")
            .font(MarqueeTheme.mono(9))
            .foregroundStyle(MarqueeTheme.mutedOnPaper)
        }
      }
      .foregroundStyle(MarqueeTheme.ink)
      .padding(.leading, 12)
      .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.blue).frame(width: 2) }
    }
  }

  private func airLine(label: String, detail: String, credit: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      (Text(label.uppercased() + " ")
        .font(MarqueeTheme.mono(10, weight: .bold))
        .foregroundStyle(MarqueeTheme.blue)
        + Text(detail).font(MarqueeTheme.sans(13)))
      Text(credit)
        .font(MarqueeTheme.mono(9))
        .foregroundStyle(MarqueeTheme.mutedOnPaper)
    }
    .foregroundStyle(MarqueeTheme.ink)
    .padding(.leading, 12)
    .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.blue).frame(width: 2) }
  }

  private func nextEpisodeDetail(_ nextEpisode: TitleNextEpisode) -> String {
    var details: [String] = []
    if let season = nextEpisode.season, let episode = nextEpisode.episode {
      details.append("S\(season)E\(episode)")
    }
    if let name = nextEpisode.episodeName, !name.isEmpty { details.append(name) }
    details.append(MarqueeDate.dateTime(nextEpisode.airsAt))
    if let network = nextEpisode.network, !network.isEmpty { details.append(network) }
    return details.joined(separator: " · ")
  }

  private var statusSuffix: String {
    guard item.nextAirDate == nil, let status = item.status else { return "" }
    return " · \(status)"
  }

  private func formattedDate(_ value: String) -> String {
    MarqueeDate.titleDate(
      value,
      includesWeekday: item.nextAirDate != nil,
      includesYear: item.nextAirDate == nil
    ) + (item.nextAirDate != nil ? ", date only" : "")
  }
}

struct TitleAwardsView: View {
  let awards: AwardSummary

  private let shown = 3

  var body: some View {
    if !awards.isEmpty {
      VStack(alignment: .leading, spacing: 5) {
        TitleDetailSectionLabel("AWARDS CABINET")
        if awards.entries.isEmpty {
          if let summary = awards.summary {
            Text(summary).font(MarqueeTheme.sans(13))
            credit("Counted by OMDb, which does not name them")
          }
        } else {
          Text(awardTally(awards)).font(MarqueeTheme.sans(13))
          if !listed.isEmpty {
            Text(listed.map(awardLine).joined(separator: " · ") + heldBack)
              .font(MarqueeTheme.mono(10))
              .lineSpacing(3)
              .foregroundStyle(MarqueeTheme.mutedOnPaper)
          }
          credit("Named awards from Wikidata")
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .foregroundStyle(MarqueeTheme.ink)
      .padding(.leading, 12)
      .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.acid).frame(width: 2) }
    }
  }

  private var won: [AwardEntry] { awards.entries.filter { $0.outcome == "won" } }

  private var listed: [AwardEntry] { Array(won.prefix(shown)) }

  private var heldBack: String {
    let held = won.count - listed.count
    return held > 0 ? " · and \(held) more won" : ""
  }

  private func credit(_ label: String) -> some View {
    Text(label)
      .font(MarqueeTheme.mono(9))
      .foregroundStyle(MarqueeTheme.mutedOnPaper)
  }
}

struct TitleVisualFormatView: View {
  let format: TitleVisualFormat?

  var body: some View {
    if let format, !titleVisualFormatLabel(format).isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        (Text("SHOT IN ")
          .font(MarqueeTheme.mono(10, weight: .bold))
          .foregroundStyle(MarqueeTheme.blue)
          + Text(titleVisualFormatLabel(format)).font(MarqueeTheme.sans(13)))
        Text("Visual format from Wikidata")
          .font(MarqueeTheme.mono(9))
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
      .foregroundStyle(MarqueeTheme.ink)
      .padding(.leading, 12)
      .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.blue).frame(width: 2) }
    }
  }
}

struct TitleGroundView: View {
  let places: TitlePlaces

  private let namesShown = 10

  var body: some View {
    if !places.filming.isEmpty {
      ground(sentence: "Shot at \(sentenceList(labels(places.filming))).", note: filmingNote)
    } else if !places.narrative.isEmpty {
      ground(
        sentence:
          "Nobody has filed where this was shot. It is set in \(sentenceList(labels(places.narrative))), which is a different thing.",
        note: ""
      )
    }
  }

  private func ground(sentence: String, note: String) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      TitleDetailSectionLabel("GROUND")
      Text(sentence)
        .font(MarqueeTheme.sans(13))
        .lineSpacing(3)
      if !note.isEmpty {
        Text(note)
          .font(MarqueeTheme.mono(9))
          .lineSpacing(3)
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .foregroundStyle(MarqueeTheme.ink)
  }

  private func labels(_ places: [TitlePlace]) -> [String] {
    places.prefix(namesShown).map(\.label)
  }

  private var filmingNote: String {
    let broad = places.filming.filter(\.isVague).count
    let unnamed = places.filming.count - min(places.filming.count, namesShown)
    let counted =
      "\(places.filming.count) \(places.filming.count == 1 ? "place" : "places") on Wikidata"
      + (unnamed > 0 ? ", \(unnamed) of them not listed here" : "")

    return broad > 0
      ? counted
        + " · \(broad) named no finer than a country or a region, so read them as directions rather than addresses"
      : counted + " · every one of them pinned to somewhere you could stand"
  }
}

struct TitleSourceWorkLine: View {
  let source: SourceWork?

  var body: some View {
    if let source {
      Text(sourceWorkMeta(source))
        .font(MarqueeTheme.sans(13))
        .foregroundStyle(MarqueeTheme.mutedOnPaper)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct TitleCreditsView: View {
  let credits: CreditsResponse
  let seasons: [CreditSeason]
  let isLoading: Bool
  let selectedSeason: Int?
  let onSeason: (Int?) -> Void
  let onBack: () -> Void
  let onMore: () -> Void

  var body: some View {
    if !credits.cast.isEmpty || !credits.crew.isEmpty || !seasons.isEmpty {
      VStack(alignment: .leading, spacing: 14) {
        Text("Who made it\(credits.total > 0 ? " · \(credits.total) credited" : "")")
          .font(MarqueeTheme.mono(12, weight: .bold))
          .tracking(1)
          .textCase(.uppercase)
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
        if !seasons.isEmpty {
          Menu {
            Button("The series") { onSeason(nil) }
            ForEach(seasons) { season in
              Button("Season \(season.season)") { onSeason(season.season) }
            }
          } label: {
            HStack(spacing: 16) {
              Text(selectedSeason.map { "SEASON \($0)" } ?? "THE SERIES")
              Image(systemName: "chevron.down")
            }
            .font(MarqueeTheme.mono(11, weight: .bold))
            .foregroundStyle(MarqueeTheme.ink)
            .padding(.horizontal, 12)
            .frame(height: 40)
            .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
          }
        }
        if crewGroups.isEmpty && credits.cast.isEmpty {
          Text(isLoading ? "Reading…" : "Not read yet.")
            .font(MarqueeTheme.sans(13))
            .foregroundStyle(MarqueeTheme.mutedOnPaper)
        }
        ForEach(crewGroups, id: \.job) { group in
          VStack(alignment: .leading, spacing: 3) {
            Text(group.job.uppercased())
              .font(MarqueeTheme.mono(11))
              .tracking(0.6)
              .foregroundStyle(MarqueeTheme.muted)
            Text(group.names.joined(separator: ", "))
              .font(MarqueeTheme.sans(15))
              .lineSpacing(3)
          }
        }
        if !credits.cast.isEmpty {
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 180))], spacing: 8) {
            ForEach(credits.cast) { credit in
              VStack(alignment: .leading, spacing: 2) {
                Text(credit.name)
                  .font(MarqueeTheme.sans(14, weight: .semibold))
                if let character = credit.character, !character.isEmpty {
                  Text(character)
                    .font(MarqueeTheme.sans(12))
                    .foregroundStyle(MarqueeTheme.muted)
                }
                if let episode = credit.episodeNumber {
                  Text("Episode \(episode)")
                    .font(MarqueeTheme.sans(12))
                    .foregroundStyle(MarqueeTheme.muted)
                } else if let count = credit.episodeCount, count > 0 {
                  Text("\(count) episodes")
                    .font(MarqueeTheme.sans(12))
                    .foregroundStyle(MarqueeTheme.muted)
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
        if credits.page > 1 || credits.hasMore {
          HStack {
            Button("Back", action: onBack).disabled(credits.page <= 1)
            Spacer()
            Text("Page \(credits.page)")
            Spacer()
            Button("More", action: onMore).disabled(!credits.hasMore)
          }
          .font(MarqueeTheme.mono(9, weight: .bold))
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
          .buttonStyle(CreditPagerButtonStyle())
        }
      }
      .foregroundStyle(MarqueeTheme.ink)
      .padding(.top, 20)
      .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.paperLine).frame(height: 1) }
    }
  }

  private var crewGroups: [(job: String, names: [String])] {
    var groups: [(job: String, names: [String], firstSeen: Int)] = []
    for (index, credit) in credits.crew.enumerated() {
      guard let job = credit.job else { continue }
      if let groupIndex = groups.firstIndex(where: { $0.job == job }) {
        groups[groupIndex].names.append(credit.name)
      } else {
        groups.append((job, [credit.name], index))
      }
    }
    return groups.sorted {
      let leftRank = crewOrder.firstIndex(of: $0.job) ?? crewOrder.count
      let rightRank = crewOrder.firstIndex(of: $1.job) ?? crewOrder.count
      return leftRank == rightRank ? $0.firstSeen < $1.firstSeen : leftRank < rightRank
    }
    .map { ($0.job, $0.names) }
  }

  private let crewOrder = [
    "Director", "Creator", "Screenplay", "Writer", "Story", "Novel",
    "Original Music Composer", "Music", "Director of Photography", "Editor",
    "Production Design", "Costume Design", "Producer", "Executive Producer", "Casting",
  ]
}

private struct CreditPagerButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
      .opacity(configuration.isPressed ? 0.6 : 1)
  }
}

struct TitleKeywordsView: View {
  let keywords: [String]

  var body: some View {
    if !keywords.isEmpty {
      FlowLayout(spacing: 9) {
        ForEach(keywords, id: \.self) { keyword in
          Text(keyword.uppercased())
            .font(MarqueeTheme.mono(10, weight: .bold))
            .tracking(0.6)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
        }
      }
      .foregroundStyle(MarqueeTheme.ink)
    }
  }
}

struct TitleDetailRail: View {
  let label: String
  let items: [MediaTitle]
  let currentID: String?

  var body: some View {
    if !items.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        Text(label.uppercased())
          .font(MarqueeTheme.mono(9, weight: .bold))
          .tracking(0.9)
          .foregroundStyle(MarqueeTheme.mutedOnPaper)
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 12) {
            ForEach(items) { item in
              NavigationLink {
                TitleDetailView(item: item)
              } label: {
                VStack(alignment: .leading, spacing: 6) {
                  Artwork(url: item.posterUrl, seed: item.id)
                    .frame(width: 104, height: 156)
                    .overlay {
                      if item.id == currentID {
                        Rectangle().stroke(MarqueeTheme.blue, lineWidth: 3)
                      }
                    }
                  Text(item.title)
                    .font(MarqueeTheme.sans(12, weight: .heavy))
                    .lineLimit(2)
                  Text(mediaMeta(item))
                    .font(MarqueeTheme.mono(8))
                    .foregroundStyle(MarqueeTheme.mutedOnPaper)
                    .lineLimit(2)
                }
                .frame(width: 104, alignment: .leading)
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
      .foregroundStyle(MarqueeTheme.ink)
      .padding(.top, 22)
      .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.paperLine).frame(height: 1) }
    }
  }
}

struct TitleInsightRail: View {
  let pairs: [InsightPair]

  var body: some View {
    if !pairs.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 8) {
          Text("AI")
            .foregroundStyle(MarqueeTheme.white)
            .frame(width: 20, height: 20)
            .background(MarqueeTheme.blue)
          Text("WATCH NEXT")
        }
        .font(MarqueeTheme.mono(9, weight: .bold))
        .tracking(0.9)
        .foregroundStyle(MarqueeTheme.mutedOnPaper)
        ForEach(pairs) { pair in
          NavigationLink {
            TitleDetailView(item: pair.item)
          } label: {
            HStack(spacing: 13) {
              Artwork(url: pair.item.posterUrl, seed: pair.item.id)
                .frame(width: 40, height: 58)
              VStack(alignment: .leading, spacing: 3) {
                Text(pair.item.title).font(MarqueeTheme.sans(14, weight: .heavy))
                Text(pair.reason)
                  .font(MarqueeTheme.mono(10))
                  .foregroundStyle(MarqueeTheme.mutedOnPaper)
                  .lineLimit(2)
              }
              Spacer()
              Image(systemName: "arrow.right")
                .font(.system(size: 12, weight: .bold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(MarqueeTheme.white)
            .overlay { Rectangle().stroke(MarqueeTheme.paperLine) }
          }
          .buttonStyle(.plain)
        }
      }
      .foregroundStyle(MarqueeTheme.ink)
      .padding(.top, 22)
      .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.paperLine).frame(height: 1) }
    }
  }
}
