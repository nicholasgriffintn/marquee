import SwiftUI

struct TonightView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = TonightModel()
  @State private var prompt = ""

  private var loadKey: String {
    "\(appState.isSignedIn)-\(appState.selectedProviderIDs.sorted().joined(separator: ","))"
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 32) {
        if let hero = model.sections.first?.items.first {
          heroView(hero)
        } else {
          MarqueeMasthead(
            eyebrow: "Tonight at Marquee",
            title: "Something worth sitting down for.",
            copy: "Your services, your shelf, and the whole catalogue — set out for this evening."
          )
          .padding(.horizontal, 18)
          .padding(.top, 16)
        }

        usherConsole

        if model.isLoading {
          LoadingHouse()
        } else if !model.error.isEmpty && model.sections.isEmpty {
          HouseMessage(title: "The board is blank.", message: model.error)
            .padding(.horizontal, 18)
        }

        if !model.curated.isEmpty {
          TitleRail(
            section: CatalogSection(
              id: "curator",
              title: "The Usher found these",
              description: model.curatorSummary,
              items: model.curated,
              angle: nil,
              reason: nil
            ))
        }

        if let pick = model.pick, let item = pick.item {
          pickView(item, response: pick)
            .padding(.horizontal, 18)
        }

        ForEach(model.sections) { TitleRail(section: $0) }

        if !model.episodes.isEmpty { episodeBoard }

        if !model.trending.isEmpty {
          TitleRail(
            section: CatalogSection(
              id: "trending",
              title: "What the town is reading about",
              description: "The titles gathering attention beyond the building.",
              items: model.trending,
              angle: nil,
              reason: nil
            ))
        }
      }
      .padding(.bottom, 30)
    }
    .navigationTitle("Marquee")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: loadKey) {
      await model.load(
        api: appState.api,
        providerIDs: appState.selectedProviderIDs.sorted(),
        isSignedIn: appState.isSignedIn
      )
    }
    .refreshable {
      await model.load(
        api: appState.api,
        providerIDs: appState.selectedProviderIDs.sorted(),
        isSignedIn: appState.isSignedIn
      )
    }
    .marqueePage()
  }

  private func heroView(_ hero: MediaTitle) -> some View {
    NavigationLink {
      TitleDetailView(item: hero)
    } label: {
      ZStack(alignment: .bottomLeading) {
        Artwork(
          url: hero.backdropUrl ?? hero.posterUrl,
          seed: hero.id,
          aspectRatio: 16 / 11,
          height: 360
        )
        LinearGradient(
          colors: [.clear, MarqueeTheme.ink.opacity(0.98)], startPoint: .center, endPoint: .bottom)
        VStack(alignment: .leading, spacing: 8) {
          Text("TONIGHT'S BOARD").font(MarqueeTheme.mono(10, weight: .bold)).tracking(1.4)
            .foregroundStyle(MarqueeTheme.acid)
          Text(hero.title)
            .font(MarqueeTheme.display(39))
            .fontWeight(.semibold)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
          Text(itemMeta(hero))
            .font(MarqueeTheme.mono(10))
            .foregroundStyle(MarqueeTheme.muted)
            .lineLimit(1)
          Text(hero.overview)
            .font(MarqueeTheme.sans(13))
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
      }
    }
    .buttonStyle(.plain)
  }

  private var usherConsole: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        AsyncImage(url: AppConfiguration.baseURL.appending(path: "/usher-face.svg")) { image in
          image.resizable().scaledToFit()
        } placeholder: {
          Image(systemName: "person.crop.square")
        }
        .frame(width: 48, height: 48)
        VStack(alignment: .leading, spacing: 4) {
          Text("ASK THE USHER").font(MarqueeTheme.mono(10, weight: .bold)).foregroundStyle(
            MarqueeTheme.acid)
          Text("Half-remembered plot, exact mood, awkward room. Give me something to work with.")
            .font(MarqueeTheme.sans(13)).foregroundStyle(MarqueeTheme.muted)
        }
      }
      HStack(spacing: 8) {
        TextField("Something tense, under two hours…", text: $prompt)
          .font(MarqueeTheme.sans(14))
          .textFieldStyle(.plain)
          .padding(12)
          .background(MarqueeTheme.ink)
          .overlay { Rectangle().stroke(MarqueeTheme.line) }
          .onSubmit { Task { await ask() } }
        Button {
          Task { await ask() }
        } label: {
          if model.isAsking {
            ProgressView().tint(MarqueeTheme.ink)
          } else {
            Image(systemName: "arrow.right")
          }
        }
        .frame(width: 45, height: 45)
        .foregroundStyle(MarqueeTheme.ink)
        .background(MarqueeTheme.acid)
        .disabled(prompt.trimmingCharacters(in: .whitespaces).isEmpty || model.isAsking)
      }
      if appState.isSignedIn {
        Button {
          Task {
            await model.askForPick(
              api: appState.api, providerIDs: appState.selectedProviderIDs.sorted())
          }
        } label: {
          Label(model.isPicking ? "Choosing…" : "Just pick one", systemImage: "flashlight.on.fill")
            .font(MarqueeTheme.mono(11, weight: .bold))
        }
        .disabled(model.isPicking)
      }
      if !model.error.isEmpty {
        Text(model.error).font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.coral)
      }
    }
    .padding(16)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
    .padding(.horizontal, 18)
  }

  private func ask() async {
    let value = prompt
    await model.ask(value, api: appState.api, providerIDs: appState.selectedProviderIDs.sorted())
  }

  private func pickView(_ item: MediaTitle, response: UsherPickResponse) -> some View {
    NavigationLink {
      TitleDetailView(item: item)
    } label: {
      HStack(spacing: 14) {
        Artwork(url: item.posterUrl, seed: item.id).frame(width: 92, height: 138)
        VStack(alignment: .leading, spacing: 7) {
          Text("I'D PUT MY NAME TO THIS").font(MarqueeTheme.mono(9, weight: .bold)).foregroundStyle(
            MarqueeTheme.acid)
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

  private var episodeBoard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("On tonight").font(MarqueeTheme.display(26)).fontWeight(.semibold)
      ForEach(model.episodes.prefix(8)) { episode in
        HStack(alignment: .firstTextBaseline) {
          Text(episodeTime(episode.airsAt)).font(MarqueeTheme.mono(10, weight: .bold))
            .foregroundStyle(MarqueeTheme.acid).frame(width: 54, alignment: .leading)
          VStack(alignment: .leading) {
            Text(episode.showName).font(MarqueeTheme.sans(13, weight: .bold))
            Text(episodeCode(episode)).font(MarqueeTheme.mono(9)).foregroundStyle(
              MarqueeTheme.muted)
          }
          Spacer()
        }
        Divider().overlay(MarqueeTheme.line)
      }
    }
    .padding(18)
    .background(MarqueeTheme.panel)
    .padding(.horizontal, 18)
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
