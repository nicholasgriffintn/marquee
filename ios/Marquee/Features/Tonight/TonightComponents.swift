import SwiftUI

struct TonightHero: View {
  let item: MediaTitle

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      Artwork(url: item.backdropUrl, seed: item.id, aspectRatio: 16 / 9, height: 540)
      LinearGradient(
        colors: [MarqueeTheme.ink.opacity(0.22), MarqueeTheme.ink.opacity(0.72), MarqueeTheme.ink],
        startPoint: .topTrailing,
        endPoint: .bottomLeading
      )
      VStack(alignment: .leading, spacing: 16) {
        Text(item.title)
          .font(MarqueeTheme.display(titleSize))
          .fontWeight(.medium)
          .tracking(-2.4)
          .lineLimit(4)
          .fixedSize(horizontal: false, vertical: true)
        Text("\(mediaMeta(item)) · \(scoreLabel(item))")
          .font(MarqueeTheme.mono(10, weight: .medium))
          .tracking(0.4)
          .textCase(.uppercase)
          .foregroundStyle(MarqueeTheme.acid)
          .fixedSize(horizontal: false, vertical: true)
        Text(item.overview.isEmpty ? "No synopsis available." : item.overview)
          .font(MarqueeTheme.sans(14))
          .foregroundStyle(MarqueeTheme.paper.opacity(0.86))
          .lineSpacing(3)
          .lineLimit(4)
        NavigationLink {
          TitleDetailView(item: item)
        } label: {
          HStack(spacing: 9) {
            Image(systemName: "arrow.up.right")
            Text("See where to watch")
          }
          .font(MarqueeTheme.sans(12, weight: .heavy))
          .foregroundStyle(MarqueeTheme.ink)
          .padding(.horizontal, 16)
          .frame(height: 43)
          .background(MarqueeTheme.acid)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 22)
      .padding(.bottom, 28)
    }
    .frame(maxWidth: .infinity)
    .clipped()
  }

  private var titleSize: CGFloat {
    if item.title.count > 46 { return 34 }
    if item.title.count > 26 { return 42 }
    return 50
  }
}

struct TonightUsherHero: View {
  let prompt: String
  let status: String
  let summary: String
  let error: String
  let items: [MediaTitle]
  let pick: UsherPickResponse?
  let isAsking: Bool
  let isPicking: Bool
  let onClear: () -> Void
  let onRefine: (String) -> Void

  @State private var activeID = ""

  private let refinements = ["Shorter", "Lighter", "Older", "Weirder", "More acclaimed"]

  private var isPick: Bool { isPicking || pick != nil }
  private var active: MediaTitle? {
    if isPick { return pick?.item }
    return items.first(where: { $0.id == activeID }) ?? items.first
  }
  private var isThinking: Bool { isAsking || isPicking }

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      if let active {
        Artwork(
          url: active.backdropUrl ?? active.posterUrl,
          seed: active.id,
          aspectRatio: 16 / 9,
          height: 560
        )
      } else {
        MarqueeTheme.ink.frame(height: 560)
      }

      LinearGradient(
        colors: [MarqueeTheme.ink.opacity(0.18), MarqueeTheme.ink.opacity(0.78), MarqueeTheme.ink],
        startPoint: .topTrailing,
        endPoint: .bottomLeading
      )

      VStack(alignment: .leading, spacing: 15) {
        Button(action: onClear) {
          Label("Back to tonight", systemImage: "arrow.left")
            .font(MarqueeTheme.mono(10, weight: .bold))
        }

        HStack(spacing: 11) {
          Image("UsherHead")
            .resizable()
            .scaledToFit()
            .frame(width: 58, height: 42)
          VStack(alignment: .leading, spacing: 3) {
            Text("THE USHER")
              .font(MarqueeTheme.mono(10, weight: .bold))
              .tracking(1.8)
              .foregroundStyle(MarqueeTheme.acid)
            Text(usherContext)
              .font(MarqueeTheme.serif(13))
              .italic()
              .foregroundStyle(MarqueeTheme.muted)
              .lineLimit(1)
          }
        }

        if !error.isEmpty {
          Text("No.")
            .font(MarqueeTheme.display(48))
            .fontWeight(.medium)
          Text(error)
            .font(MarqueeTheme.sans(15))
            .foregroundStyle(MarqueeTheme.coral)
            .accessibilityLabel("The Usher could not answer: \(error)")
        } else if let active {
          usherAnswer(active)
        } else {
          HStack(spacing: 12) {
            ProgressView().tint(MarqueeTheme.acid)
            Text(status.isEmpty ? "Reading the room." : status)
              .font(MarqueeTheme.sans(15))
              .foregroundStyle(MarqueeTheme.paper.opacity(0.82))
          }
          .frame(minHeight: 90, alignment: .leading)
          .accessibilityElement(children: .combine)
          .accessibilityLabel(status.isEmpty ? "The Usher is thinking" : status)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 22)
      .padding(.top, 24)
      .padding(.bottom, 28)
    }
    .frame(maxWidth: .infinity)
    .clipped()
  }

  private var usherContext: String {
    if isPick { return isThinking ? "picking something" : "my pick for tonight" }
    return prompt.isEmpty ? "since you asked" : "you asked: “\(prompt)”"
  }

  @ViewBuilder private func usherAnswer(_ item: MediaTitle) -> some View {
    Text(item.title)
      .font(MarqueeTheme.display(item.title.count > 34 ? 35 : 44))
      .fontWeight(.medium)
      .tracking(-1.6)
      .fixedSize(horizontal: false, vertical: true)
    Text("\(mediaMeta(item)) · \(scoreLabel(item))")
      .font(MarqueeTheme.mono(9, weight: .medium))
      .tracking(0.35)
      .textCase(.uppercase)
      .foregroundStyle(MarqueeTheme.acid)

    if isThinking {
      HStack(spacing: 10) {
        ProgressView().tint(MarqueeTheme.acid)
        Text(status.isEmpty ? "Reading the room." : status)
      }
      .font(MarqueeTheme.sans(14))
      .foregroundStyle(MarqueeTheme.paper.opacity(0.88))
      .accessibilityElement(children: .combine)
    } else {
      Text(pick?.line ?? summary)
        .font(MarqueeTheme.sans(14))
        .foregroundStyle(MarqueeTheme.paper.opacity(0.88))
        .lineSpacing(3)
    }

    if let facts = pick?.facts {
      ForEach(facts, id: \.self) { fact in
        Text("— \(fact)")
          .font(MarqueeTheme.mono(9))
          .foregroundStyle(MarqueeTheme.muted)
      }
    }

    NavigationLink {
      TitleDetailView(item: item)
    } label: {
      Label("See where to watch", systemImage: "arrow.up.right")
        .font(MarqueeTheme.sans(12, weight: .heavy))
        .foregroundStyle(MarqueeTheme.ink)
        .padding(.horizontal, 16)
        .frame(height: 43)
        .background(MarqueeTheme.acid)
    }

    if !isPick, items.count > 1 {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(items) { candidate in
            Button {
              activeID = candidate.id
            } label: {
              Artwork(url: candidate.posterUrl, seed: candidate.id)
                .frame(width: 48, height: 72)
                .overlay {
                  Rectangle().stroke(
                    candidate.id == item.id ? MarqueeTheme.acid : MarqueeTheme.line,
                    lineWidth: candidate.id == item.id ? 2 : 1
                  )
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(candidate.title)
            .accessibilityValue(candidate.id == item.id ? "Selected" : "")
          }
        }
      }
    }

    if !isPick, !items.isEmpty, !isThinking {
      VStack(alignment: .leading, spacing: 8) {
        Text("REFINE")
          .font(MarqueeTheme.mono(9, weight: .bold))
          .foregroundStyle(MarqueeTheme.muted)
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 7) {
            ForEach(refinements, id: \.self) { refinement in
              Button(refinement) { onRefine(refinement) }
                .font(MarqueeTheme.sans(11, weight: .medium))
                .padding(.horizontal, 11)
                .frame(height: 36)
                .overlay { Rectangle().stroke(MarqueeTheme.line) }
            }
          }
        }
      }
    }
  }
}

struct TonightUsherConsole: View {
  @Binding var prompt: String
  let isAsking: Bool
  let isPicking: Bool
  let onAsk: (String) -> Void
  let onPick: () -> Void

  private let seeds = [
    "Something short and funny",
    "A slow burn for a rainy night",
    "Watch with my kids",
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 0) {
        Image("UsherHead")
          .resizable()
          .scaledToFit()
          .padding(7)
          .frame(width: 54, height: 54)
          .background(MarqueeTheme.paper)
          .overlay(alignment: .trailing) { Rectangle().fill(MarqueeTheme.line).frame(width: 1) }
        TextField("Ask the Usher. 90 mins, clever but not bleak…", text: $prompt)
          .font(MarqueeTheme.sans(14))
          .textFieldStyle(.plain)
          .padding(.horizontal, 14)
          .submitLabel(.go)
          .onSubmit { submit(prompt) }
        Button {
          submit(prompt)
        } label: {
          if isAsking {
            ProgressView().tint(MarqueeTheme.paper)
          } else {
            Image(systemName: "arrow.right")
          }
        }
        .frame(width: 54, height: 54)
        .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.line).frame(width: 1) }
        .disabled(isBusy || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
      .background(MarqueeTheme.panel)
      .background { Rectangle().fill(MarqueeTheme.blue).offset(x: 7, y: 7) }
      .overlay { Rectangle().stroke(MarqueeTheme.line) }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          Button(isPicking ? "Deciding…" : "Just pick something", action: onPick)
            .font(MarqueeTheme.mono(11, weight: .heavy))
            .textCase(.uppercase)
            .foregroundStyle(MarqueeTheme.acid)
            .padding(.horizontal, 14)
            .frame(height: 42)
            .overlay { Rectangle().stroke(MarqueeTheme.acid) }
            .disabled(isBusy)

          ForEach(seeds, id: \.self) { seed in
            Button(seed) {
              prompt = seed
              submit(seed)
            }
            .font(MarqueeTheme.sans(12, weight: .medium))
            .padding(.horizontal, 12)
            .frame(height: 42)
            .overlay { Rectangle().stroke(MarqueeTheme.line) }
            .disabled(isBusy)
          }
        }
      }
    }
    .padding(.horizontal, 22)
  }

  private var isBusy: Bool { isAsking || isPicking }

  private func submit(_ value: String) {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !isBusy else { return }
    onAsk(trimmed)
  }
}

struct TonightProviderStrip: View {
  let providers: [MarqueeProvider]
  let selectedProviderIDs: Set<String>
  let isSignedIn: Bool
  let onRequireSignIn: () -> Void
  let onSelect: (Set<String>) -> Void

  private var filterable: [MarqueeProvider] {
    providers.filter { $0.status == "feed" && !($0.tmdbProviderIds ?? []).isEmpty }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text(
          selectedProviderIDs.isEmpty
            ? "Showing everything"
            : "Showing \(selectedProviderIDs.count) service\(selectedProviderIDs.count == 1 ? "" : "s")"
        )
        .font(MarqueeTheme.sans(15, weight: .heavy))
        Spacer()
        if isSignedIn {
          NavigationLink {
            NotebookView().toolbar(.hidden, for: .tabBar)
          } label: {
            manageServicesLabel
          }
        } else {
          Button(action: onRequireSignIn) {
            manageServicesLabel
          }
        }
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          providerButton(id: nil, name: "All")
          ForEach(filterable) { provider in
            providerButton(id: provider.id, name: provider.name)
          }
        }
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 22)
    .background(MarqueeTheme.panel)
    .overlay(alignment: .top) {
      Rectangle().fill(MarqueeTheme.line).frame(height: 1)
    }
    .overlay(alignment: .bottom) {
      Rectangle().fill(MarqueeTheme.line).frame(height: 1)
    }
  }

  private var manageServicesLabel: some View {
    HStack(spacing: 6) {
      Text("Manage services")
      Image(systemName: "arrow.right")
    }
    .font(MarqueeTheme.mono(9, weight: .bold))
  }

  private func providerButton(id: String?, name: String) -> some View {
    let selected = id.map(selectedProviderIDs.contains) ?? selectedProviderIDs.isEmpty

    return Button {
      guard let id else {
        onSelect([])
        return
      }

      var next = selectedProviderIDs
      if selected { next.remove(id) } else { next.insert(id) }
      onSelect(next)
    } label: {
      VStack(spacing: 5) {
        if let id {
          ProviderBadge(providerID: id, name: name, size: 34)
        } else {
          Text("ALL")
            .font(MarqueeTheme.mono(10, weight: .heavy))
            .frame(width: 42, height: 34)
        }
        Text(selected && id != nil ? "ON" : " ")
          .font(MarqueeTheme.mono(8, weight: .bold))
          .foregroundStyle(MarqueeTheme.acid)
      }
      .frame(width: 70, height: 58)
      .background(MarqueeTheme.tile)
      .overlay(alignment: .bottom) {
        if selected { Rectangle().fill(MarqueeTheme.acid).frame(height: 4) }
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(name)
    .accessibilityValue(selected ? "Showing" : "Not showing")
  }
}

struct TonightPickCard: View {
  let item: MediaTitle
  let response: UsherPickResponse

  var body: some View {
    NavigationLink {
      TitleDetailView(item: item)
    } label: {
      HStack(spacing: 14) {
        Artwork(url: item.posterUrl, seed: item.id).frame(width: 92, height: 138)
        VStack(alignment: .leading, spacing: 7) {
          Text("I'D PUT MY NAME TO THIS")
            .font(MarqueeTheme.mono(9, weight: .bold))
            .foregroundStyle(MarqueeTheme.acid)
          Text(item.title).font(MarqueeTheme.display(25)).fontWeight(.semibold)
          Text(response.line).font(MarqueeTheme.sans(13)).foregroundStyle(MarqueeTheme.muted)
          ForEach(response.facts, id: \.self) { Text("— \($0)").font(MarqueeTheme.mono(9)) }
        }
      }
      .padding(14)
      .background(MarqueeTheme.panel)
    }
    .buttonStyle(.plain)
  }
}

struct TonightEpisodeBoard: View {
  let episodes: [ScheduledEpisode]

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text("On tonight").font(MarqueeTheme.display(26)).fontWeight(.semibold)
        Spacer()
        Text("Schedule from TVmaze").font(MarqueeTheme.mono(8)).foregroundStyle(
          MarqueeTheme.muted)
      }
      ForEach(episodes.prefix(8)) { episode in
        HStack(alignment: .firstTextBaseline) {
          Text(episodeTime(episode.airsAt))
            .font(MarqueeTheme.mono(10, weight: .bold))
            .foregroundStyle(MarqueeTheme.acid)
            .frame(width: 54, alignment: .leading)
          VStack(alignment: .leading) {
            Text(episode.showName).font(MarqueeTheme.sans(13, weight: .bold))
            Text(episodeCode(episode))
              .font(MarqueeTheme.mono(9))
              .foregroundStyle(MarqueeTheme.muted)
          }
          Spacer()
        }
        Divider().overlay(MarqueeTheme.line)
      }
    }
    .padding(18)
    .background(MarqueeTheme.panel)
  }

  private func episodeCode(_ episode: ScheduledEpisode) -> String {
    var details: [String] = []

    if let season = episode.season, let number = episode.episode {
      details.append("S\(season)E\(number)")
    } else {
      details.append("New episode")
    }
    if let name = episode.episodeName, !name.isEmpty { details.append(name) }
    if let network = episode.network, !network.isEmpty { details.append(network) }

    return details.joined(separator: " · ")
  }

  private func episodeTime(_ value: String) -> String {
    guard let date = MarqueeDate.parse(value) else { return "—" }
    if Calendar.current.isDateInToday(date) {
      return date.formatted(date: .omitted, time: .shortened)
    }
    return date.formatted(.dateTime.weekday(.abbreviated).hour().minute())
  }
}
