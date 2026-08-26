import AVFoundation
import Foundation

@MainActor
final class RevivalModel: ObservableObject {
  @Published private(set) var programme: RevivalProgramme?
  @Published private(set) var isLoading = true
  @Published private(set) var error = ""
  @Published private(set) var searchResults: [RevivalCard] = []
  @Published private(set) var isSearching = false
  private var searchTask: Task<Void, Never>?

  func load(api: APIClient) async {
    isLoading = true
    do {
      programme = try await api.get("/api/revival")
      error = ""
    } catch {
      self.error = error.localizedDescription
    }
    isLoading = false
  }

  func search(query: String, api: APIClient) {
    searchTask?.cancel()
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count >= 2 else {
      searchResults = []
      isSearching = false
      return
    }

    isSearching = true
    searchTask = Task { [weak self] in
      do {
        try await Task.sleep(for: .milliseconds(250))
        let response: RevivalSearchResponse = try await api.get(
          "/api/revival/search",
          query: [URLQueryItem(name: "q", value: trimmed)]
        )
        try Task.checkCancellation()
        self?.searchResults = response.works
        self?.isSearching = false
      } catch is CancellationError {
        return
      } catch {
        self?.searchResults = []
        self?.isSearching = false
      }
    }
  }
}

@MainActor
final class RevivalScreeningModel: ObservableObject {
  @Published private(set) var screening: RevivalScreening?
  @Published private(set) var player: AVPlayer?
  @Published private(set) var catalogueTitle: MediaTitle?
  @Published private(set) var hasStarted = false
  @Published private(set) var isLoading = true
  @Published private(set) var error = ""
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var lastReportedPosition = 0

  func load(id: String, api: APIClient) async {
    removePlayerObservers()
    isLoading = true
    hasStarted = false
    screening = nil
    catalogueTitle = nil
    error = ""
    lastReportedPosition = 0
    do {
      let value: RevivalScreening = try await api.get("/api/revival/\(id)")
      let player = AVPlayer(url: value.work.reelUrl)
      if value.positionSeconds > 0 {
        await player.seek(
          to: CMTime(seconds: Double(value.positionSeconds), preferredTimescale: 600))
      }
      screening = value
      self.player = player
      catalogueTitle = await loadCatalogueTitle(id: value.work.titleId, api: api)
      error = ""
    } catch {
      self.error = error.localizedDescription
    }
    isLoading = false
  }

  func start(api: APIClient, canSave: Bool) {
    guard let player else { return }
    hasStarted = true
    player.play()
    guard canSave, timeObserver == nil else { return }
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 20, preferredTimescale: 600), queue: .main
    ) { [weak self] time in
      let seconds = Int(time.seconds.rounded(.down))
      Task { @MainActor [weak self] in
        await self?.reportProgress(seconds: seconds, api: api, canSave: true)
      }
    }
    if let item = player.currentItem {
      endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
      ) { [weak self] _ in
        let seconds = Int(item.duration.seconds.rounded(.down))
        Task { @MainActor [weak self] in
          await self?.reportProgress(
            seconds: seconds, finished: true, api: api, canSave: true)
        }
      }
    }
  }

  func reportProgress(api: APIClient, canSave: Bool) async {
    guard canSave, let player else { return }
    let position = player.currentTime().seconds
    guard position.isFinite, position >= 0 else { return }
    let seconds = Int(position.rounded(.down))
    let duration = player.currentItem?.duration.seconds ?? 0
    let finished = duration.isFinite && duration > 0 && position / duration > 0.97

    await reportProgress(seconds: seconds, finished: finished, api: api, canSave: canSave)
  }

  func stop() {
    player?.pause()
    removePlayerObservers()
  }

  private func reportProgress(
    seconds: Int, finished: Bool = false, api: APIClient, canSave: Bool
  ) async {
    guard canSave, let screening else { return }
    guard finished || abs(seconds - lastReportedPosition) >= 20 else { return }
    lastReportedPosition = seconds

    try? await api.send(
      "/api/revival/\(screening.work.id)/progress",
      method: "POST",
      body: RevivalProgressRequest(positionSeconds: seconds, finished: finished)
    )
  }

  private func loadCatalogueTitle(id: String?, api: APIClient) async -> MediaTitle? {
    guard let id else { return nil }
    let response: TitleItemsResponse? = try? await api.get(
      "/api/catalog/items", query: [URLQueryItem(name: "ids", value: id)])
    return response?.items.first
  }

  private func removePlayerObservers() {
    if let timeObserver, let player {
      player.removeTimeObserver(timeObserver)
    }
    timeObserver = nil
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = nil
  }
}
