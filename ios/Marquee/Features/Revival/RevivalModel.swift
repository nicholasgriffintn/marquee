import AVFoundation
import Foundation

@MainActor
final class RevivalModel: ObservableObject {
  @Published private(set) var programme: RevivalProgramme?
  @Published private(set) var isLoading = true
  @Published private(set) var error = ""

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
}

@MainActor
final class RevivalScreeningModel: ObservableObject {
  @Published private(set) var screening: RevivalScreening?
  @Published private(set) var player: AVPlayer?
  @Published private(set) var isLoading = true
  @Published private(set) var error = ""

  func load(id: String, api: APIClient) async {
    do {
      let value: RevivalScreening = try await api.get("/api/revival/\(id)")
      let player = AVPlayer(url: value.work.reelUrl)
      if value.positionSeconds > 0 {
        await player.seek(
          to: CMTime(seconds: Double(value.positionSeconds), preferredTimescale: 600))
      }
      screening = value
      self.player = player
    } catch {
      self.error = error.localizedDescription
    }
    isLoading = false
  }

  func reportProgress(api: APIClient, canSave: Bool) async {
    guard canSave, let screening, let player else { return }
    let position = player.currentTime().seconds
    guard position.isFinite, position >= 0 else { return }
    let seconds = Int(position.rounded(.down))

    try? await api.send(
      "/api/revival/\(screening.work.id)/progress",
      method: "POST",
      body: RevivalProgressRequest(positionSeconds: seconds, finished: false)
    )
  }
}
