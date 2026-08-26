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
        NavigationLink {
          NotebookView().toolbar(.hidden, for: .tabBar)
        } label: {
          HStack(spacing: 6) {
            Text("Manage services")
            Image(systemName: "arrow.right")
          }
          .font(MarqueeTheme.mono(9, weight: .bold))
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
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
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
    if let season = episode.season, let number = episode.episode {
      return "S\(season)E\(number) · \(episode.episodeName ?? "New episode")"
    }
    return episode.episodeName ?? "New episode"
  }

  private func episodeTime(_ value: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: value) else { return "Tonight" }
    return date.formatted(date: .omitted, time: .shortened)
  }
}
