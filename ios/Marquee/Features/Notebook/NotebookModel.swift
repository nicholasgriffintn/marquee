import Foundation

@MainActor
final class NotebookModel: ObservableObject {
  @Published private(set) var beliefs: [Belief] = []
  @Published private(set) var guests: [Guest] = []
  @Published private(set) var providers: [MarqueeProvider] = []
  @Published private(set) var feeds: FeedKeys?
  @Published private(set) var alerts: AlertConfiguration?
  @Published private(set) var preferences: NotebookPreferences?
  @Published private(set) var isLoading = true
  @Published var error = ""

  func load(api: APIClient) async {
    isLoading = true
    async let notebookValue: NotebookResponse? = try? api.get("/api/notebook")
    async let guestValue: GuestResponse? = try? api.get("/api/notebook/guests")
    async let providerValue: ProvidersResponse? = try? api.get("/api/catalog/providers")
    async let feedValue: FeedKeys? = try? api.get("/api/notebook/feeds")
    async let alertValue: AlertConfiguration? = try? api.get("/api/notebook/alerts")
    async let preferenceValue: NotebookPreferences? = try? api.get("/api/notebook/preferences")

    let values = await (
      notebookValue, guestValue, providerValue, feedValue, alertValue, preferenceValue
    )
    beliefs = values.0?.beliefs ?? []
    guests = values.1?.guests ?? []
    providers = values.2?.providers ?? []
    feeds = values.3
    alerts = values.4
    preferences = values.5
    isLoading = false
  }

  func setAccess(adultConfirmed: Bool, offensiveContentApproved: Bool, api: APIClient) async {
    guard let preferences else { return }
    do {
      self.preferences = try await api.send(
        "/api/notebook/preferences",
        method: "POST",
        body: preferences.withAccess(
          adultConfirmed: adultConfirmed, offensiveContentApproved: offensiveContentApproved)
      )
    } catch {
      self.error = error.localizedDescription
    }
  }

  func act(
    on belief: Belief, action: String, value: String? = nil, scope: String? = nil, api: APIClient
  ) async {
    var body = ["action": action]
    if let value { body["value"] = value }
    if let scope { body["scope"] = scope }

    do {
      try await api.send("/api/notebook/\(belief.id)", method: "PATCH", body: body)
      let response: NotebookResponse = try await api.get("/api/notebook")
      beliefs = response.beliefs
    } catch {
      self.error = error.localizedDescription
    }
  }

  func saveGuest(name: String, vetoes: String, api: APIClient) async {
    let request = GuestSaveRequest(
      name: name.trimmingCharacters(in: .whitespacesAndNewlines),
      vetoes: vetoes.split(separator: ",").map {
        $0.trimmingCharacters(in: .whitespacesAndNewlines)
      }.filter { !$0.isEmpty }
    )
    guard !request.name.isEmpty else { return }

    do {
      let response: GuestResponse = try await api.send(
        "/api/notebook/guests", method: "POST", body: request)
      guests = response.guests
    } catch {
      self.error = error.localizedDescription
    }
  }

  func removeGuest(_ guest: Guest, api: APIClient) async {
    do {
      let response: GuestResponse = try await api.send(
        "/api/notebook/guests/\(guest.id)",
        method: "DELETE",
        body: [String: String]()
      )
      guests = response.guests
    } catch {
      self.error = error.localizedDescription
    }
  }

  func setAlert(_ kind: AlertKind, enabled: Bool, api: APIClient) async {
    do {
      let response: AlertKindsResponse = try await api.send(
        "/api/notebook/alerts/settings",
        method: "POST",
        body: AlertSettingRequest(kind: kind.kind, enabled: enabled)
      )
      if let alerts {
        self.alerts = AlertConfiguration(
          email: alerts.email, verified: alerts.verified, kinds: response.kinds)
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  func setAlertEmail(_ email: String, api: APIClient) async {
    do {
      try await api.send("/api/notebook/alerts/email", method: "POST", body: ["email": email])
      if let alerts {
        self.alerts = AlertConfiguration(email: email, verified: false, kinds: alerts.kinds)
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  func createFeeds(api: APIClient) async {
    do {
      feeds = try await api.send("/api/notebook/feeds", method: "POST", body: [String: String]())
    } catch {
      self.error = error.localizedDescription
    }
  }

  func removeFeeds(api: APIClient) async {
    do {
      feeds = try await api.send("/api/notebook/feeds", method: "DELETE", body: [String: String]())
    } catch {
      self.error = error.localizedDescription
    }
  }
}
