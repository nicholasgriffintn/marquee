import SwiftUI

struct TitleDetailView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model: TitleDetailModel
  @State private var confirmRemoval = false
  let item: MediaTitle

  init(item: MediaTitle) {
    self.item = item
    _model = StateObject(wrappedValue: TitleDetailModel(titleID: item.id))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        hero
        details
        watchOptions
        if appState.isSignedIn {
          shelfForm
        } else {
          TicketGate(
            title: "Keep this on your shelf.",
            message: "A ticket lets you mark it, rate it and leave a note for the Usher."
          )
          .padding(.horizontal, -18)
        }
        sourceLinks
      }
      .padding(18)
      .padding(.bottom, 30)
    }
    .navigationTitle(item.title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: "\(item.id)-\(appState.isSignedIn)") {
      await model.load(api: appState.api, isSignedIn: appState.isSignedIn)
    }
    .confirmationDialog("Remove this title from your shelf?", isPresented: $confirmRemoval) {
      Button("Remove from shelf", role: .destructive) {
        Task { if await model.remove(api: appState.api) { appState.shelfDidChange() } }
      }
    }
    .marqueePage()
  }

  private var hero: some View {
    ZStack(alignment: .bottomLeading) {
      Artwork(url: item.backdropUrl ?? item.posterUrl, seed: item.id, aspectRatio: 16 / 10)
        .frame(height: 290)
      LinearGradient(colors: [.clear, MarqueeTheme.ink], startPoint: .center, endPoint: .bottom)
      VStack(alignment: .leading, spacing: 5) {
        Text(item.mediaType == "movie" ? "FEATURE" : "SERIES").font(
          MarqueeTheme.mono(9, weight: .bold)
        ).foregroundStyle(MarqueeTheme.acid)
        Text(item.title).font(MarqueeTheme.display(36)).fontWeight(.semibold)
        Text(
          [itemMeta(item), runtimeLabel(minutes: item.runtimeMinutes)].filter { !$0.isEmpty }
            .joined(separator: " · ")
        )
        .font(MarqueeTheme.mono(10)).foregroundStyle(MarqueeTheme.muted)
      }
      .padding(.bottom, 8)
    }
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 11) {
      if let tagline = item.tagline, !tagline.isEmpty {
        Text(tagline).font(MarqueeTheme.display(22)).italic().foregroundStyle(MarqueeTheme.acid)
      }
      Text(item.overview).font(MarqueeTheme.sans(15)).fixedSize(horizontal: false, vertical: true)
      if !item.genres.isEmpty {
        Text(item.genres.joined(separator: " · ")).font(MarqueeTheme.mono(10)).foregroundStyle(
          MarqueeTheme.muted)
      }
    }
  }

  @ViewBuilder private var watchOptions: some View {
    if !item.providers.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        Text("WHERE TO WATCH").font(MarqueeTheme.mono(10, weight: .bold)).tracking(1.2)
          .foregroundStyle(MarqueeTheme.acid)
        ForEach(item.providers) { provider in
          if let url = provider.webUrl ?? item.watchLink {
            Link(destination: url) {
              HStack {
                Text(provider.name).font(MarqueeTheme.sans(13, weight: .bold))
                Spacer()
                Text(provider.offerTypes.joined(separator: ", ")).font(MarqueeTheme.mono(9))
                  .foregroundStyle(MarqueeTheme.muted)
                Image(systemName: "arrow.up.right")
              }
              .padding(12).background(MarqueeTheme.panel)
            }
          }
        }
      }
    }
  }

  private var shelfForm: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("YOUR SHELF").font(MarqueeTheme.mono(10, weight: .bold)).tracking(1.2).foregroundStyle(
        MarqueeTheme.acid)
      Picker("Status", selection: $model.entry.status) {
        ForEach(EntryStatus.allCases) { Text($0.label).tag($0) }
      }
      .pickerStyle(.menu)
      HStack {
        Text("Rating").font(MarqueeTheme.sans(13, weight: .bold))
        Spacer()
        ForEach(1...5, id: \.self) { value in
          Button {
            model.entry.rating = model.entry.rating == value ? nil : value
          } label: {
            Image(systemName: value <= (model.entry.rating ?? 0) ? "star.fill" : "star")
          }
        }
      }
      TextEditor(text: $model.entry.thoughts)
        .font(MarqueeTheme.sans(14))
        .scrollContentBackground(.hidden)
        .frame(minHeight: 96)
        .padding(8)
        .background(MarqueeTheme.ink)
        .overlay { Rectangle().stroke(MarqueeTheme.line) }
      HStack {
        Button {
          Task { if await model.save(api: appState.api) { appState.shelfDidChange() } }
        } label: {
          if model.isSaving {
            ProgressView().tint(MarqueeTheme.ink)
          } else {
            Text("Save to my shelf")
          }
        }
        .font(MarqueeTheme.mono(11, weight: .bold))
        .foregroundStyle(MarqueeTheme.ink)
        .padding(.horizontal, 16).padding(.vertical, 11)
        .background(MarqueeTheme.acid)
        Spacer()
        if model.hasExistingEntry {
          Button("Remove", role: .destructive) { confirmRemoval = true }
            .font(MarqueeTheme.mono(10, weight: .bold))
        }
      }
      if !model.message.isEmpty {
        Text(model.message).font(MarqueeTheme.sans(12)).foregroundStyle(
          model.message.hasPrefix("Saved") ? MarqueeTheme.acid : MarqueeTheme.muted)
      }
    }
    .padding(16)
    .background(MarqueeTheme.panel)
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }

  private var sourceLinks: some View {
    HStack(spacing: 18) {
      Link("TMDB", destination: item.tmdbUrl)
      if let imdb = item.imdbUrl { Link("IMDb", destination: imdb) }
      if let key = item.trailerKey, let url = URL(string: "https://www.youtube.com/watch?v=\(key)")
      {
        Link("Trailer", destination: url)
      }
    }
    .font(MarqueeTheme.mono(10, weight: .bold))
    .foregroundStyle(MarqueeTheme.muted)
  }
}
